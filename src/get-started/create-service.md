---
title: Service development tutorial
---
# Cryptocurrency Tutorial: How to Create Services

<!-- cspell:ignore protoc -->

In this tutorial we create an Exonum service that implements
a minimalistic cryptocurrency, and a single-node blockchain network processing
requests to this service. The service accepts two types of transactions:
creates a wallet with a default balance and transfers money between wallets.

You can view and download the full source code of this tutorial
[here][cryptocurrency].

For didactic purposes, the
tutorial is simplified compared to a real-life application; it does not feature
the client part and does not use [Merkelized data collections](../architecture/merkledb.md#merkelized-indices).
You can find a tutorial containing these features
[here](data-proofs.md).

## Create a Rust Project

Exonum is written in Rust and you have to install the stable Rust
compiler to build this tutorial. If you do not have the environment set up,
follow [the installation guide](install.md).

Let’s create a minimal crate with the **exonum** crate as a dependency.

```sh
cargo new cryptocurrency --lib
```

Add necessary dependencies to `Cargo.toml` in the project directory:

```toml
[package]
name = "cryptocurrency"
version = "0.1.0"
edition = "2018"
authors = ["Your Name <your@email.com>"]

[dependencies]
exonum = "1.0"
exonum-crypto = "1.0"
exonum-derive = "1.0"
exonum-proto = "1.0"
exonum-rust-runtime = "1.0"

failure = "0.1.5"
protobuf = "2.8.0"
serde = "1.0"
serde_derive = "1.0"
serde_json = "1.0"

[build-dependencies]
exonum-build = "0.10.0"
```

## Imports

Rust crates have the [`src/lib.rs`][lib.rs] file as the default entry point.
In our case, this is where we are going to place the service code.
Let’s start with importing crates with necessary types:

??? note "Imports"
    ```rust
    use exonum::crypto::{Hash, PublicKey};
    use exonum::merkledb::{
        access::{Access, FromAccess},
        Fork, MapIndex, Snapshot,
    };
    use exonum::runtime::{ExecutionContext, ExecutionError};
    use exonum_derive::*;
    use exonum_proto::ProtobufConvert;
    use exonum_rust_runtime::api::{self, ServiceApiBuilder, ServiceApiState};
    use exonum_rust_runtime::Service;

    use serde_derive::{Deserialize, Serialize};
    ```

## Constants

Let’s define some constants we will use later on:

```rust
// Starting balance of a newly created wallet
const INIT_BALANCE: u64 = 100;
```

## Declare Persistent Data

Exonum uses Protobuf as its [serialization format](../architecture/serialization.md)
for storage of data. Thus, we need to describe our structures using the Protobuf
interface description language first. The corresponding Rust structures will be
later generated from them.

We should declare what kind of data the service will store in the blockchain.
In our case we need to declare a single type – *wallet*.
Inside the wallet we want to store:

- **Public key** which is the address of the wallet
- **Name of the owner** (purely for convenience reasons)
- **Current balance** of the wallet.

As a first step we add a module named `proto` to our project. We add a
`service.proto` file to this module and describe the `Wallet` structure
in it in the Protobuf format. The `Wallet` datatype will look as follows:

```protobuf
syntax = "proto3";

// Allows to use `exonum.PublicKey` structure already described in `exonum`
// library.
import "types.proto";

// Wallet structure used to persist data within the service.
message Wallet {
  exonum.crypto.PublicKey pub_key = 1;
  string name = 2;
  uint64 balance = 3;
}
```

Secondly, to integrate the Protobuf-generated files into the `proto` module of
the project, we add a `mod.rs` file with the following content to the `proto`
module:

```rust
#![allow(bare_trait_objects)]

pub use self::service::*;

include!(concat!(env!("OUT_DIR"), "/protobuf_mod.rs"));
use exonum::crypto::proto::*;
```

We also need to add the `proto` module to `lib.rs` file:

```rust
mod proto;
```

As a third step, in the `build.rs` file we introduce the `main` function that
generates Rust files from their Protobuf descriptions.

!!! note
    Make sure that at this stage you have `protoc` installed. See the
    [install](install.md) page for details.

```rust
use exonum_build::ProtobufGenerator;

fn main() {
    ProtobufGenerator::with_mod_name("protobuf_mod.rs")
        .with_input_dir("src/proto")
        .with_crypto()
        .generate();
}
```

Finally, we create the same structure definition of the wallet in Rust language
based on the `proto` schema presented above. The service will use the structure
for further operations with data schema and to [validate](../architecture/serialization.md#additional-validation-for-protobuf-generated-structures)
the corresponding `.rs` Protobuf-generated file with this structure:

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[derive(ProtobufConvert, BinaryValue, ObjectHash)]
#[protobuf_convert(source = "proto::Wallet")]
pub struct Wallet {
    pub pub_key: PublicKey,
    pub name: String,
    pub balance: u64,
}
```

Derive `ProtobufConvert` from `exonum_derive` helps to validate the Protobuf
structure presented earlier. In this way we make sure that
`exonum::crypto::PublicKey` corresponds to the public key in the proto format.
Therefore, we can safely use it in our `Wallet` structure.

We need to change the wallet balance, so we add methods to the `Wallet` type:

```rust
impl Wallet {
    pub fn new(&pub_key: &PublicKey, name: &str, balance: u64) -> Self {
        Self {
            pub_key,
            name: name.to_owned(),
            balance,
        }
    }

    pub fn increase(self, amount: u64) -> Self {
        let balance = self.balance + amount;
        Self::new(&self.pub_key, &self.name, balance)
    }

    pub fn decrease(self, amount: u64) -> Self {
        debug_assert!(self.balance >= amount);
        let balance = self.balance - amount;
        Self::new(&self.pub_key, &self.name, balance)
    }
}
```

We have added two methods: one to increase the wallet balance and another one
to decrease it. These methods are *immutable*; they consume the old instance
of the wallet and produce a new instance with the modified `balance` field.

## Create Schema

Schema is a structured view of [the key-value storage](../architecture/merkledb.md)
used in Exonum.
To access the storage, however, we will not use the storage directly, but
rather a generic `Access` abstraction. `Access` is a trait that wraps underlying
database access types like `Snapshot`s and `Fork`s.

!!! tip
    `Snapshot` represents an immutable view of the storage,
    and `Fork` is a mutable one, where the changes can be easily
    rolled back. For more details see
    [MerkleDB docs](../architecture/merkledb.md).

As the schema should work with both types of storage views, we declare it as
a generic structure with a template parameter that implements `Access` trait:

```rust
#[derive(Debug, FromAccess)]
pub struct CurrencySchema<T: Access> {
    /// Correspondence of public keys of users to the account information.
    pub wallets: MapIndex<T::Base, PublicKey, Wallet>,
}
```

The structure layout corresponds to the database layout in the storage, so we
don't need to create any glue code to connect this structure to the database.
This code is generated automatically by deriving `FromAccess`.

Since we want to keep the wallets in the storage, we will
use an instance of [`MapIndex`](../architecture/merkledb.md#mapindex),
a map abstraction.
Keys of the index will correspond to public keys of the wallets.
Index values will be stored as serialized `Wallet` structures.

To initialize our `CurrencySchema`, `FromAccess` trait provides a convenient
method `from_root`. Using this method, we can implement a constructor to
simplify interaction with `CurrencySchema`:

```rust
impl<T: Access> CurrencySchema<T> {
    pub fn new(access: T) -> Self {
        Self::from_root(access).unwrap()
    }
}
```

## Define Transactions

[Transaction](../architecture/transactions.md) is a kind of message which
performs atomic actions on the blockchain state.

For our Cryptocurrency Tutorial we need two transaction types:

- Create a new wallet and add some money to it
- Transfer money between two different wallets.

The transaction to create a new wallet (`TxCreateWallet`) contains
a name of the user who created this wallet. Address of the wallet will
be derived from the public key that was used to sign this transaction.

```protobuf
// Transaction type for creating a new wallet.
message TxCreateWallet {
  // UTF-8 string with the owner's name.
  string name = 1;
}
```

The transaction to transfer tokens between different wallets (`TxTransfer`)
has a public key of the receiver (`to`). It also contains the amount of money
to move between the wallets. We add the `seed` field to make sure that our
transaction is [impossible to replay](../architecture/transactions.md#non-replayability).
Sender's public key will be the same key that was used to sign the transaction.

```protobuf
// Transaction type for transferring tokens between two wallets.
message TxTransfer {
  // Public key of the receiver.
  exonum.crypto.PublicKey to = 1;
  // Number of tokens to transfer from the sender's account to the receiver's
  // account.
  uint64 amount = 2;
  // Auxiliary number to guarantee non-idempotence of transactions.
  uint64 seed = 3;
}
```

Now, just as we did with the `Wallet` structure above, we need to describe the
same transactions in Rust:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, ProtobufConvert, BinaryValue)]
#[protobuf_convert(source = "proto::TxCreateWallet")]
pub struct TxCreateWallet {
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, ProtobufConvert, BinaryValue)]
#[protobuf_convert(source = "proto::TxTransfer")]
pub struct TxTransfer {
    pub to: PublicKey,
    pub amount: u64,
    pub seed: u64,
}
```

To make the service support the transactions defined above, we need to declare
a service *interface*. A service interface is basically a trait with methods
that correspond to the transactions processing logic. In our case the interface
will look as follows:

```rust
/// Cryptocurrency service transactions.
#[exonum_interface]
pub trait CryptocurrencyInterface<Ctx> {
    /// Output of the methods in this interface.
    type Output;

    /// Creates wallet with the given `name`.
    #[interface_method(id = 0)]
    fn create_wallet(&self, ctx: Ctx, arg: TxCreateWallet) -> Self::Output;
    /// Transfers `amount` of the currency from one wallet to another.
    #[interface_method(id = 1)]
    fn transfer(&self, ctx: Ctx, arg: TxTransfer) -> Self::Output;
}
```

`exonum_interface` macro generates a glue to dispatch transactions and
deserialize their payload within service. `interface_method` macro assigns
the numeric IDs to the transactions. This is required, since a call information
in transactions contains the transaction ID rather than the method name.

With that, target users will know which transaction ID they should set to
invoke a certain method.

!!! note
    All the transactions numeric IDs should be unique. An attempt to create two methods
    with the same numeric ID will result in a compilation error.

### Reporting Errors

The execution of the transaction may be unsuccessful for some reason.
For example, the transaction `TxCreateWallet` will not be executed
if the wallet with such public key already exists.
There are also three reasons why the transaction `TxTransfer` cannot be
executed:

- There is no sender with the given public key
- There is no recipient with the given public key
- The sender has insufficient currency amount.

Let’s define the codes of the above errors:

```rust
/// Error codes emitted by `TxCreateWallet` and/or `TxTransfer`
/// transactions during execution.
#[derive(Debug, ExecutionFail)]
pub enum Error {
    /// Wallet already exists.
    WalletAlreadyExists = 0,
    /// Sender doesn't exist.
    SenderNotFound = 1,
    /// Receiver doesn't exist.
    ReceiverNotFound = 2,
    /// Insufficient currency amount.
    InsufficientCurrencyAmount = 3,
    /// Sender same as receiver.
    SenderSameAsReceiver = 4,
}
```

Deriving the `ExecutionFail` trait here will make our errors generic and
compatible with other error kinds used within Exonum blockchain; this trait
is similar to `failure::Fail`.

### Transaction Execution

Above we've defined the interface of our service, but currently this interface
has no implementation. Thus, there is no actual business logic attached to
them. To fix this situation, we should declare our service, and then implement
the `CryptocurrencyInterface` trait for it.

Service is a `struct` which implements specific traits
defined by the Rust runtime:

```rust
/// Cryptocurrency service implementation.
#[derive(Debug, ServiceFactory, ServiceDispatcher)]
#[service_dispatcher(implements("CryptocurrencyInterface"))]
#[service_factory(proto_sources = "crate::proto")]
pub struct CryptocurrencyService;

impl Service for CryptocurrencyService {}
```

`service_dispatcher` macro collects information about interfaces implemented
by service, and `service_factory` macro generates a code to create instances
of our service, similarly to the [factory method pattern][factory-method].

[factory-method]: https://en.wikipedia.org/wiki/Factory_method_pattern

The implementation of the `Service` trait can contain the additional elements of
the service lifecycle, like wiring the API. Currently we can skip them and
leave the implementation empty.

Now, when we have the structure, we can implement the actual business logic.
We will do it in two steps, one step for each transaction we have.

For creating a wallet, we check that the wallet does not exist and add a new
wallet if so:

```rust
impl CryptocurrencyInterface<ExecutionContext<'_>> for CryptocurrencyService {
    type Output = Result<(), ExecutionError>;

    fn create_wallet(
        &self,
        context: ExecutionContext<'_>,
        arg: TxCreateWallet,
    ) -> Self::Output {
        let author = context
            .caller()
            .author()
            .expect("Wrong 'TxCreateWallet' initiator");

        let mut schema = CurrencySchema::new(context.service_data());
        if schema.wallets.get(&author).is_none() {
            let wallet = Wallet::new(&author, &arg.name, INIT_BALANCE);
            println!("Created wallet: {:?}", wallet);
            schema.wallets.put(&author, wallet);
            Ok(())
        } else {
            Err(Error::WalletAlreadyExists.into())
        }
    }

    // `transfer` transaction will be implemented on the next step.
}
```

!!! warning
    Calling `expect` in the code above is not really suitable for production use.
    In actual services consider using `CallerAddress` for better forward
    compatibility.

This transaction also sets the wallet balance to 100. To work with database,
we instantiate `CurrencySchema` using `service_data` method of `ExecutionContext`.

!!! tip
    `ExecutionContext` structure provides an interface to interact with blockchain
    and service data. For our service, we can obtain both mutable and immutable
    access to data; for any other kind of data, only read-only access is available.

`TxTransfer` transaction gets two wallets for both sides of the transfer
transaction. If they are found, we check the balance of the sender. If
the sender has enough tokens, then we decrease the sender’s balance
and increase the receiver’s balance.

We also need to check that the sender does not send the tokens to himself.
Otherwise, if the sender is equal to the receiver, the implementation below will
create money out of thin air.

```rust
impl CryptocurrencyInterface<ExecutionContext<'_>> for CryptocurrencyService {
    type Output = Result<(), ExecutionError>;

    // We implemented the `create_wallet` transaction in the previous step.

    fn transfer(
        &self,
        context: ExecutionContext<'_>,
        arg: TxTransfer,
    ) -> Self::Output {
        let author = context
            .caller()
            .author()
            .expect("Wrong 'TxTransfer' initiator");
        if author == arg.to {
            return Err(Error::SenderSameAsReceiver.into());
        }

        let mut schema = CurrencySchema::new(context.service_data());
        let sender = schema.wallets.get(&author).ok_or(Error::SenderNotFound)?;
        let receiver = schema
            .wallets
            .get(&arg.to)
            .ok_or(Error::ReceiverNotFound)?;

        let amount = arg.amount;
        if sender.balance >= amount {
            let sender = sender.decrease(amount);
            let receiver = receiver.increase(amount);
            println!("Transfer between wallets: {:?} => {:?}", sender, receiver);
            schema.wallets.put(&author, sender);
            schema.wallets.put(&arg.to, receiver);
            Ok(())
        } else {
            Err(Error::InsufficientCurrencyAmount.into())
        }
    }
}
```

## Implement API

Next, we need to implement the node API.
With this aim we declare a blank struct that includes a set of methods that
correspond to different types of requests:

```rust
#[derive(Debug, Clone, Copy)]
struct CryptocurrencyApi;
```

For `CryptocurrencyService`, we want to implement 2 read requests:

- Return the information about all wallets in the system
- Return the information about a specific wallet identified by the public key.

To accomplish this, we define a couple of corresponding methods in
`CryptocurrencyApi` that use `state` to read information from the blockchain
storage.

For parsing a public key of a specific wallet we define a helper structure.

```rust
/// The structure describes the query parameters for the `get_wallet` endpoint.
#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
pub struct WalletQuery {
    /// Public key of the requested wallet.
    pub pub_key: PublicKey,
}

impl CryptocurrencyApi {
    /// Endpoint for getting a single wallet.
    pub fn get_wallet(
        state: &ServiceApiState<'_>,
        pub_key: PublicKey,
    ) -> api::Result<Wallet> {
        let schema = CurrencySchema::new(state.service_data());
        schema
            .wallets
            .get(&pub_key)
            .ok_or_else(|| api::Error::not_found().title("Wallet not found"))
    }

    /// Endpoint for dumping all wallets from the storage.
    pub fn get_wallets(
        state: &ServiceApiState<'_>,
        _query: (),
    ) -> api::Result<Vec<Wallet>> {
        let schema = CurrencySchema::new(state.service_data());
        Ok(schema.wallets.values().collect())
    }
}
```

The `state` contains an interface to access blockchain data, which
is needed to implement [read requests](../architecture/services.md#read-requests).

As with the transaction endpoint, the methods have an idiomatic signature

```rust
type Handle<Query, Response> =
    fn(&ServiceApiState<'_>, Query) -> api::Result<Response>;
```

We also declare a helper method to wire the API, which later can be invoked
by the service:

```rust
impl CryptocurrencyApi {
    /// `ServiceApiBuilder` facilitates conversion between read requests
    /// and REST endpoints.
    pub fn wire(builder: &mut ServiceApiBuilder) {
        // Binds handlers to specific routes.
        builder
            .public_scope()
            .endpoint("v1/wallet", Self::get_wallet)
            .endpoint("v1/wallets", Self::get_wallets);
    }
}
```

### Wire API

As the final step of the API implementation, we need to tie the request
processing logic to the specific endpoints.

Previously, we left the `Service` implementation for `CryptocurrencyService`
empty, but now we want to wire API, so we should add a corresponding method
to the implementation:

```rust
impl Service for CryptocurrencyService {
    fn wire_api(&self, builder: &mut ServiceApiBuilder) {
        CryptocurrencyApi::wire(builder);
    }
}
```

## Create Demo Blockchain

The service is ready. You can verify that the library code compiles by running
`cargo build` in the shell. However, we do not have the means of processing
requests
to the service. To fix this, let us create a minimalistic blockchain network
with one node and a single service we’ve just finished creating.

The code we are going to write is logically separate from the service itself.
The service library could be connected to an Exonum-powered blockchain
together with other services,
while the demo blockchain is a specific example of its usage. For this reason,
we will position the blockchain code as an [*example*][cargo-example] and
place it into [`examples/demo.rs`][demo.rs].

### Additional Dependencies

Since services themselves do not require the Exonum node, in this example we
want to create one, and interact with it as well. Thus, we have to add several
additional dependencies in our `Cargo.toml`:

```toml
# Dependencies required for example.
[dev-dependencies]
exonum-explorer-service = "1.0"
exonum-node = "1.0"
exonum-system-api = "1.0"
```

### Imports

Add imports to `example/demo.rs` file:

```rust
use exonum::{
    blockchain::{
        config::{GenesisConfig, GenesisConfigBuilder},
        ConsensusConfig, ValidatorKeys,
    },
    keys::Keys,
    merkledb::TemporaryDB,
};
use exonum_explorer_service::ExplorerFactory;
use exonum_node::{NodeApiConfig, NodeBuilder, NodeConfig};
use exonum_rust_runtime::{DefaultInstance, RustRuntime, ServiceFactory};
use exonum_system_api::SystemApiPlugin;

use cryptocurrency::CryptocurrencyService;
```

### Configure Node

For launching a blockchain node, we need to specify its configuration.
We will create this configuration in a separate `node_config` function:

```rust
fn node_config() -> NodeConfig {
    // Code goes here
}
```

[Node configuration](../architecture/configuration.md) consists of two
parts:

- Local configuration which includes:

    - Node configuration (e.g., IP settings and other configuration parts)
    - API configuration (e.g., settings of REST API)

- Global configuration or genesis configuration (all parameters
  that need to be the same for all the nodes in the network)

Consensus configuration contains a list of public keys of
[validators](../glossary.md#validator), i.e., nodes that can vote for block
acceptance. Our demo blockchain network has only one validator (our node).
Fill this list with the public keys we generate randomly:

```rust
let (consensus_public_key, consensus_secret_key) =
    exonum::crypto::gen_keypair();
let (service_public_key, service_secret_key) =
    exonum::crypto::gen_keypair();

let validator_keys = ValidatorKeys {
    consensus_key: consensus_public_key,
    service_key: service_public_key,
};
let consensus = ConsensusConfig::default()
    .with_validator_keys(vec![validator_keys]);
```

!!! note
    In real applications, keys would be stored in the configuration file so
    that the node can be safely restarted.

Let’s configure REST API to open the node for external web requests.
Our node will expose API on port 8000 of every network interface.

```rust
let api_address = "0.0.0.0:8000".parse().unwrap();
let api_cfg = NodeApiConfig {
    public_api_address: Some(api_address),
    ..Default::default()
};
```

We also configure our node to listen to peer-to-peer connections on port 2000
for all network interfaces. This port is used for interactions among full nodes
in the Exonum network.

```rust
let peer_address = "0.0.0.0:2000";

// Returns the value of the `NodeConfig` object from `node_config`.
NodeConfig {
    listen_address: peer_address.parse().unwrap(),
    consensus,
    external_address: peer_address.to_owned(),
    network: Default::default(),
    connect_list: Default::default(),
    api: api_cfg,
    mempool: Default::default(),
    thread_pool_size: Default::default(),
    keys: Keys::from_keys(
        consensus_public_key,
        consensus_secret_key,
        service_public_key,
        service_secret_key,
    ),
}
```

## Create Genesis Configuration

`NodeConfig` that we created earlier defines the configuration for the **node**,
but we also need a configuration for the **blockchain**. To initialize
the blockchain, we need `GenesisConfig` structure.

Let's create a function which will generate `GenesisConfig` based on
the created `NodeConfig`:

```rust
fn genesis_config(config: &NodeConfig) -> GenesisConfig {
    let artifact_id = CryptocurrencyService.artifact_id();
    GenesisConfigBuilder::with_consensus_config(config.consensus.clone())
        .with_artifact(ExplorerFactory.artifact_id())
        .with_instance(ExplorerFactory.default_instance())
        .with_artifact(artifact_id.clone())
        .with_instance(artifact_id.into_default_instance(101, "cryptocurrency"))
        .build()
}
```

In the code above we create `GenesisConfig` from the consensus configuration,
and add the `Explorer` and our `Cryptocurrency` services.

`Explorer` service is capable of sending transactions to the blockchain, so
without this service we won't be able to interact with the `Cryptocurrency` service.
For details about `Explorer` service see the
[Other Services](../advanced/other-services.md) article.

### Run Node

Finally, we need to implement the entry point to our demo network – `main`
function:

```rust
fn main() {
    exonum::helpers::init_logger().unwrap();
    let db = TemporaryDB::new();
    let node_cfg = node_config();
    let genesis_cfg = genesis_config(&node_cfg);

    let node = NodeBuilder::new(db, node_cfg, genesis_cfg)
        .with_plugin(SystemApiPlugin)
        .with_runtime_fn(|channel| {
            RustRuntime::builder()
                .with_factory(CryptocurrencyService)
                .with_factory(ExplorerFactory)
                .build(channel.endpoints_sender())
        })
        .build();

    node.run().unwrap();
}
```

That is, we:

1. Initialize logging in the Exonum core library.
2. Create a node with the non-persistent database (`TemporaryDB`), Rust runtime
  (which is required to run services written in Rust programming language),
  two services (`CryptocurrencyService` and `Explorer`), and the
  configuration we have specified earlier.
3. Run the created node.

The demo blockchain can now be executed with the
`RUST_LOG=info cargo run --example demo` command.

## Interact With Blockchain

### Send Transactions via REST API

Let’s send some transactions to our demo blockchain. Usually transactions are
created, signed, serialized and sent with the help of the
[light client](light-client.md). The service receives an already serialized
byte array. Therefore, for simplicity, in our examples below we use the
ready-made transactions prepared with the light client.

#### Create the First Wallet

Create `create-wallet-1.json` file and insert the following code into it:

```json
{
  "tx_body": "0a0f0a0d0a02086512070a05416c69636512220a20070122b6eb3f63a14b25aacd7a1922c418025e04b1be9d1febdfdbcf676157991a420a40fe3c632764e71d135b47d9b17b4f6aab296b94aefc0dea9ca2cfc781cfa7677b445d473086758cbbf4f0b09cf9d61953b77c67ae87a123a553bdf7578236b703"
}
```

Use the `curl` command to send this transaction to the node by HTTP:

```sh
curl -H "Content-Type: application/json" \
  -X POST \
  -d @create-wallet-1.json \
  http://127.0.0.1:8000/api/explorer/v1/transactions
```

This transaction creates the first wallet associated with user Alice.
The transaction endpoint returns the hash of the transaction:

```json
{
  "tx_hash": "abe9ac1eef23b4cda7fc408ce488b233c3446331ac0f8195b7d21a210908b447"
}
```

The node will show in the log that the first wallet has been created:

```none
Create the wallet: Wallet { pub_key: PublicKey(070122b6...),
                            name: "Alice", balance: 100 }
```

#### Create the Second Wallet

To create the second wallet put the code into `create-wallet-2.json` file:

```json
{
  "tx_body": "0a0d0a0b0a02086512050a03426f6212220a20542eee3b38904e57b903fcfa6965f4643bb8beff409b61860d0ee2283050fbc71a420a4081d04a2c438e35cfdcf089826294916dc106f7580c6e09f531c564e144d4668c0d9b23a7aaf85cfcd708fd218617c80f96f3b11ad9c63835860587e9a0856a0c"
}
```

Send it with `curl` to the node:

```sh
curl -H "Content-Type: application/json" \
  -X POST \
  -d @create-wallet-2.json \
  http://127.0.0.1:8000/api/explorer/v1/transactions
```

It returns the hash of the second transaction:

```json
{
  "tx_hash": "59198ccaba93d0dcf2081f3820e54e5233d7eaf223f13c147df88ccfc351ac27"
}
```

The node will show in the log that the second wallet has been created:

```none
Create the wallet: Wallet { pub_key: PublicKey(542eee3b...),
                            name: "Bob", balance: 100 }
```

#### Transfer Between Wallets

Now we have two wallets in the database and we can transfer money between them.
Create `transfer-funds.json` and add the following code to this file:

```json
{
  "tx_body": "0a3a0a380a040865100112300a220a20542eee3b38904e57b903fcfa6965f4643bb8beff409b61860d0ee2283050fbc7100518c9a69e809091f8e13e12220a20070122b6eb3f63a14b25aacd7a1922c418025e04b1be9d1febdfdbcf676157991a420a4043107104edd28c2c1367cb50dfdee80ce583f00a9bc3ea46f5a8eded41f45a5da0be3aa503ff80705477d1e77d137a66de095102f25b20fee2c06ce217084a0e"
}
```

This transaction transfers 5 tokens from the first wallet to the second.
Send it to the node with:

```sh
curl -H "Content-Type: application/json" \
  -X POST \
  -d @transfer-funds.json \
  http://127.0.0.1:8000/api/explorer/v1/transactions
```

This request returns the transaction hash:

```json
{
  "tx_hash": "b5d68015cb47f1b1f909e7667c219f1c63a0b7c978cdd6e8ffc279d05ba66fec"
}
```

The node outputs to the console the information about this transfer:

```none
Transfer between wallets: Wallet { pub_key: PublicKey(070122b6...),
                                   name: "Alice", balance: 95 }
                       => Wallet { pub_key: PublicKey(542eee3b...),
                                   name: "Bob", balance: 105 }
```

### Read Requests

Let’s check that the defined read endpoints indeed work.

#### Info on All Wallets

```sh
curl http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets
```

This request expectedly returns information on both wallets in the system:

```json
[
  {
    "pub_key": "070122b6eb3f63a14b25aacd7a1922c418025e04b1be9d1febdfdbcf67615799",
    "name": "Alice",
    "balance": 95
  },
  {
    "pub_key": "542eee3b38904e57b903fcfa6965f4643bb8beff409b61860d0ee2283050fbc7",
    "name": "Bob",
    "balance": 105
  }
]
```

#### Info on Specific Wallet

The second read endpoint also works:

```sh
curl "http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallet?\
pub_key=070122b6eb3f63a14b25aacd7a1922c418025e04b1be9d1febdfdbcf67615799"
```

The response is:

```json
{
  "pub_key": "070122b6eb3f63a14b25aacd7a1922c418025e04b1be9d1febdfdbcf67615799",
  "name": "Alice",
  "balance": 95
}
```

## Conclusion

Hurray! 🎉 You have created the first fully functional Exonum blockchain
with two wallets and transferred some money between them. Next,
[we are going to test it](test-service.md).

[cryptocurrency]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency
[tx-info]: ../architecture/transactions.md#info
[rust-closure]: https://doc.rust-lang.org/book/first-edition/closures.html
[curry-fn]: https://en.wikipedia.org/wiki/Currying
[arc]: https://doc.rust-lang.org/std/sync/struct.Arc.html
[ref]: https://doc.rust-lang.org/std/cell/struct.Ref.html
[cargo-example]: https://doc.rust-lang.org/cargo/reference/manifest.html#examples
[lib.rs]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/src/lib.rs
[demo.rs]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/examples/demo.rs
[std-asref]: https://doc.rust-lang.org/std/convert/trait.AsRef.html
