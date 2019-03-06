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
the client part and does not use [Merkelized data collections](../architecture/storage.md#merkelized-indices).
You can find a tutorial containing these features
[here](data-proofs.md).

## Create a Rust Project

Exonum is written in Rust and you have to install the stable Rust
compiler to build this tutorial. If you do not have the environment set up,
follow [the installation guide](./install.md).

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
exonum = "0.10.0"
exonum-derive = "0.10.0"
failure = "0.1.5"
serde = "1.0.0"
serde_derive = "1.0.0"
serde_json = "1.0.0"
protobuf = "2.2.0"

[build-dependencies]
exonum-build = "0.10.0"
```

## Imports

Rust crates have the [`src/lib.rs`][lib.rs] file as the default entry point.
In our case, this is where we are going to place the service code.
Let’s start with importing crates with necessary types:

??? note "Imports"
    ```rust
    #[macro_use]
    extern crate exonum_derive;
    #[macro_use]
    extern crate failure;
    #[macro_use]
    extern crate serde_derive;

    use exonum::api::{self, ServiceApiBuilder, ServiceApiState};
    use exonum::blockchain::{
        ExecutionError, ExecutionResult, Service, Transaction,
        TransactionContext, TransactionSet,
    };
    use exonum::crypto::{Hash, PublicKey};
    use exonum::messages::RawTransaction;
    use exonum::storage::{Fork, MapIndex, Snapshot};
    ```

## Constants

Let’s define some constants we will use later on:

```rust
// Service identifier
const SERVICE_ID: u16 = 1;
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
`cryptocurrency.proto` file to this module and describe the `Wallet` structure
in it in the Protobuf format. The `Wallet` datatype will look as follows:

```protobuf
syntax = "proto3";

// Allows to use `exonum.PublicKey` structure already described in `exonum`
// library.
import "helpers.proto";

// Wallet structure used to persist data within the service.
message Wallet {
  exonum.PublicKey pub_key = 1;
  string name = 2;
  uint64 balance = 3;
}
```

Secondly, to generate a Rust structure from the above-stated definition, we add
a `mod.rs` file with the following content to the `proto` module:

```rust
#![allow(bare_trait_objects)]
#![allow(renamed_and_removed_lints)]

include!(concat!(env!("OUT_DIR"), "/protobuf_mod.rs"));

use exonum::proto::schema::*;
```

and don't forget to add this to `lib.rs` file.

```rust
mod proto;
```

As a third step in the `build.rs` file we introduce the `main` function that
generates Rust files from their Protobuf descriptions.

!!! note
    Make sure that at this stage you have `protoc` installed.

```rust
extern crate exonum_build;

use exonum_build::{get_exonum_protobuf_files_path, protobuf_generate};

fn main() {
    let exonum_protos = get_exonum_protobuf_files_path();
    protobuf_generate(
        "src/proto",
        &["src/proto", &exonum_protos],
        "protobuf_mod.rs",
    );
}
```

Finally, we create the same structure definition of the wallet in Rust language
based on the `proto` schema presented above. This structure will be used for
further operations with data schema:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, ProtobufConvert)]
#[exonum(pb = "proto::cryptocurrency::Wallet")]
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

Schema is a structured view of [the key-value storage](../architecture/storage.md)
used in Exonum.
To access the storage, however, we will not use the storage directly, but
rather `Snapshot`s and `Fork`s. `Snapshot` represents an immutable view
of the storage, and `Fork` is a mutable one, where the changes
can be easily rolled back. `Snapshot` is used
in [read requests](../architecture/services.md#read-requests), and `Fork` -
in transaction processing.

As the schema should work with both types of storage views, we declare it as
a generic wrapper:

```rust
pub struct CurrencySchema<T> {
    view: T,
}
```

For access to the objects inside the storage we need to declare the layout of
the data. As we want to keep the wallets in the storage, we will
use an instance of [`MapIndex`](../architecture/storage.md#mapindex),
a map abstraction.
Keys of the index will correspond to public keys of the wallets.
Index values will be serialized `Wallet` structs.

`Snapshot` provides random access to every piece of data inside the database.
To isolate the wallets map into a separate entity,
we add a unique prefix to it,
which is the first argument to the `MapIndex::new` call:

```rust
impl<T: AsRef<Snapshot>> CurrencySchema<T> {
    pub fn new(view: T) -> Self {
        CurrencySchema { view }
    }

    // Utility method to get a list of all the wallets from the storage
    pub fn wallets(&self) -> MapIndex<&Snapshot, PublicKey, Wallet> {
        MapIndex::new("cryptocurrency.wallets", self.view.as_ref())
    }

    // Utility method to quickly get a separate wallet from the storage
    pub fn wallet(&self, pub_key: &PublicKey) -> Option<Wallet> {
        self.wallets().get(pub_key)
    }
}
```

Here, we have declared a constructor and two getter methods for the schema.
We wrap any type that allows interacting with the schema as a `Snapshot`
reference (that is, implements the [`AsRef`][std-asref] trait from the standard
library).
`Fork` implements this trait, which means that we can construct a
`CurrencySchema` instance above the `Fork`, and use `wallets` and `wallet`
getters for it.

For `Fork`-based schema, we declare an additional method to write to the
storage:

```rust
impl<'a> CurrencySchema<&'a mut Fork> {
    pub fn wallets_mut(&mut self) -> MapIndex<&mut Fork, PublicKey, Wallet> {
        MapIndex::new("cryptocurrency.wallets", &mut self.view)
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

The transaction to transfer coins between different wallets (`TxTransfer`)
has a public key of the receiver (`to`). It also contains the amount of money
to move between the wallets. We add the `seed` field to make sure that our
transaction is [impossible to replay](../architecture/transactions.md#non-replayability).
Sender's public key will be the same key that was used to sign the transaction.

```protobuf
// Transaction type for transferring tokens between two wallets.
message TxTransfer {
  // Public key of the receiver.
  exonum.PublicKey to = 1;
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
#[derive(Serialize, Deserialize, Clone, Debug, ProtobufConvert)]
#[exonum(pb = "proto::cryptocurrency::TxCreateWallet")]
pub struct TxCreateWallet {
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, ProtobufConvert)]
#[exonum(pb = "proto::cryptocurrency::TxTransfer")]
pub struct TxTransfer {
    pub to: PublicKey,
    pub amount: u64,
    pub seed: u64,
}
```

Service transactions are defined through the enum with the derive of the
`TransactionSet`
that automatically assigns transaction IDs based on their declaration order
starting from `0`:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, TransactionSet)]
pub enum CurrencyTransactions {
    /// Create wallet transaction.
    CreateWallet(TxCreateWallet),
    /// Transfer tokens transaction.
    Transfer(TxTransfer),
}
```

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
#[derive(Debug, Fail)]
#[repr(u8)]
pub enum Error {
    #[fail(display = "Wallet already exists")]
    WalletAlreadyExists = 0,

    #[fail(display = "Sender does not exist")]
    SenderNotFound = 1,

    #[fail(display = "Receiver does not exist")]
    ReceiverNotFound = 2,

    #[fail(display = "Insufficient currency amount")]
    InsufficientCurrencyAmount = 3,

    #[fail(display = "Sender same as receiver")]
    SenderSameAsReceiver = 4,
}

// Conversion between service-specific errors and the standard error type
// that can be emitted by transactions.
impl From<Error> for ExecutionError {
    fn from(value: Error) -> ExecutionError {
        let description = format!("{}", value);
        ExecutionError::with_description(value as u8, description)
    }
}
```

### Transaction Execution

Every transaction in Exonum has business logic of the blockchain attached,
which is encapsulated in the `Transaction` trait.
This trait has `execute` method which contains logic applied to the
storage when a transaction is executed.

In our case `execute` method gets the reference to the `TransactionContext`.
It includes `Fork` of the storage (can be accessed with `.fork()`) and the
public key which was used to sign the transaction (can be accessed with
`.author()`). We wrap `Fork` with our `CurrencySchema` to access our data
layout.

For creating a wallet, we check that the wallet does not exist and add a new
wallet if so:

```rust
impl Transaction for TxCreateWallet {
    fn execute(&self, mut context: TransactionContext) -> ExecutionResult {
        let author = context.author();
        let view = context.fork();
        let mut schema = CurrencySchema::new(view);
        if schema.wallet(&author).is_none() {
            let wallet = Wallet::new(&author, &self.name, INIT_BALANCE);
            println!("Create the wallet: {:?}", wallet);
            schema.wallets_mut().put(&author, wallet);
            Ok(())
        } else {
            Err(Error::WalletAlreadyExists)?
        }
    }
}
```

This transaction also sets the wallet balance to 100. Note how we use
both “immutable” `wallet` and “mutable” `wallets_mut` methods of the schema
within `execute`.

`TxTransfer` transaction gets two wallets for both sides of the transfer
transaction. If they are found, we check the balance of the sender. If
the sender has enough coins, then we decrease the sender’s balance
and increase the receiver’s balance.

We also need to check that the sender does not send the coins to himself.
Otherwise, if the sender is equal to the receiver, the implementation below will
create money out of thin air.

```rust
impl Transaction for TxTransfer {
    fn execute(&self, mut context: TransactionContext) -> ExecutionResult {
        let author = context.author();
        let view = context.fork();

        if author == self.to {
            Err(Error::SenderSameAsReceiver)?
        }

        let mut schema = CurrencySchema::new(view);

        let sender = match schema.wallet(&author) {
            Some(val) => val,
            None => Err(Error::SenderNotFound)?,
        };

        let receiver = match schema.wallet(&self.to) {
            Some(val) => val,
            None => Err(Error::ReceiverNotFound)?,
        };

        let amount = self.amount;
        if sender.balance >= amount {
            let sender = sender.decrease(amount);
            let receiver = receiver.increase(amount);
            println!("Transfer between wallets: {:?} => {:?}", sender, receiver);
            let mut wallets = schema.wallets_mut();
            wallets.put(&author, sender);
            wallets.put(&self.to, receiver);
            Ok(())
        } else {
            Err(Error::InsufficientCurrencyAmount)?
        }
    }
}
```

## Implement API

Next, we need to implement the node API.
With this aim we declare a blank struct that includes a set of methods with the
following signature:

```rust
fn my_method(state: &ServiceApiState, query: MyQuery) -> api::Result<MyResponse>
```

The `state` contains a channel, i.e. a connection to the blockchain node
instance.
Besides the channel, it also contains a blockchain instance, which is needed
to implement [read requests](../architecture/services.md#read-requests).

```rust
struct CryptocurrencyApi;
```

### API for Transactions

The core processing logic is essentially the same for all types of transactions
and is implemented by `exonum`. To send a transaction you have to create a
transaction message according to the
[uniform structure](../architecture/transactions.md#messages) developed by
Exonum. The transaction ID is a
transaction number in the enum with `#[derive(TransactionSet)]`. As we
mentioned earlier, transactions count starts with 0.

### API for Read Requests

We want to implement 2 read requests:

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
        state: &ServiceApiState,
        query: WalletQuery
    ) -> api::Result<Wallet> {
        let snapshot = state.snapshot();
        let schema = CurrencySchema::new(snapshot);
        schema
            .wallet(&query.pub_key)
            .ok_or_else(|| api::Error::NotFound("\"Wallet not found\"".to_owned()))
    }

    /// Endpoint for dumping all wallets from the storage.
    pub fn get_wallets(
        state: &ServiceApiState,
        _query: ()
    ) -> api::Result<Vec<Wallet>> {
        let snapshot = state.snapshot();
        let schema = CurrencySchema::new(snapshot);
        let idx = schema.wallets();
        let wallets = idx.values().collect();
        Ok(wallets)
    }
}
```

As with the transaction endpoint, the methods have an idiomatic signature
`fn(&ServiceApiState, MyQuery) -> api::Result<MyResponse>`.

### Wire API

As the final step of the API implementation, we need to tie the request
processing logic to the specific endpoints.
We do this in the `CryptocurrencyApi::wire()` method:

```rust
impl CryptocurrencyApi {
    pub fn wire(builder: &mut ServiceApiBuilder) {
        // Binds handlers to the specific routes.
        builder
            .public_scope()
            .endpoint("v1/wallet", Self::get_wallet)
            .endpoint("v1/wallets", Self::get_wallets);
    }
}
```

## Define Service

Service is a group of templated transactions (we have defined them before). It
has a name and a unique ID to determine the service inside the blockchain.

```rust
#[derive(Debug)]
pub struct CurrencyService;
```

To turn `CurrencyService` into a blockchain service, we should implement the
`Service` trait in it.

!!! tip
    Read more on how to turn a type into a blockchain service in the
    [Interface with Exonum Framework](../architecture/services.md#interface-with-exonum-framework)
    section.

The two methods of the `Service` trait are simple:

- `service_name` returns the name of our service
- `service_id` returns the unique ID of our service (i.e., the `SERVICE_ID`
  constant).

The `tx_from_raw` method is used to deserialize transactions coming to the node.
If the incoming transaction is built successfully, we put it into a `Box<_>`.

The `state_hash` method is used to calculate the hash of
[the blockchain state](../glossary.md#blockchain-state). The method
should return [a vector of hashes](../architecture/services.md#state-hash) of
the [Merkelized service tables](../glossary.md#merkelized-indices).
As the wallets table is not Merkelized (a simplifying assumption discussed at
the beginning of the tutorial), the returned value should be an empty vector,
`vec![]`.

The remaining method, `wire_api`, binds APIs defined by the service.
We will use it to receive requests via REST API applying the logic we
defined in `CryptocurrencyApi` earlier:

```rust
impl Service for CurrencyService {
    fn service_name(&self) -> &'static str {
        "cryptocurrency"
    }

    fn service_id(&self) -> u16 {
        SERVICE_ID
    }

    // Implements a method to deserialize transactions coming to the node.
    fn tx_from_raw(
        &self,
        raw: RawTransaction
    ) -> Result<Box<dyn Transaction>, failure::Error> {
        let tx = CurrencyTransactions::tx_from_raw(raw)?;
        Ok(tx.into())
    }

    fn state_hash(&self, _: &dyn Snapshot) -> Vec<Hash> {
        vec![]
    }

    // Links the service API implementation to Exonum.
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

### Imports

Add imports to `example/demo.rs` file:

```rust
use exonum::{
    blockchain::{GenesisConfig, ValidatorKeys},
    node::{Node, NodeApiConfig, NodeConfig},
    storage::MemoryDB,
};
use cryptocurrency::CurrencyService;
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

Genesis configuration contains a list of public keys of
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
let genesis = GenesisConfig::new(vec![validator_keys].into_iter());
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

// Returns the value of the `NodeConfig` object from the `node_config` function
NodeConfig {
    listen_address: peer_address.parse().unwrap(),
    service_public_key,
    service_secret_key,
    consensus_public_key,
    consensus_secret_key,
    genesis,
    external_address: peer_address.to_owned(),
    network: Default::default(),
    connect_list: Default::default(),
    api: api_cfg,
    mempool: Default::default(),
    services_configs: Default::default(),
    database: Default::default(),
    thread_pool_size: Default::default(),
}
```

### Run Node

Finally, we need to implement the entry point to our demo network – `main`
function:

```rust
fn main() {
    exonum::helpers::init_logger().unwrap();
    let node = Node::new(
        MemoryDB::new(),
        vec![Box::new(CurrencyService)],
        node_config(),
        None,
    );
    node.run().unwrap();
}
```

That is, we:

1. Initialize logging in the Exonum core library
2. Create a node with in-memory database (`MemoryDB`), a single service
   (`CurrencyService`), and the configuration we have specified earlier
3. Run the created node

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
  "tx_body": "114e49a764813f2e92609d103d90f23dc5b7e94e74b3e08134c1272441614bd90000010000000a05416c69636587b54e335ef652ccae5112388d128e5162326f60d25196b34ad431e394ee2f77cfe72d201d7ba12db9b9ddd278235493dc444a3671a4710e87bad53411a45a0c"
}
```

Use the `curl` command to send this transaction to the node by HTTP:

```sh
curl -H "Content-Type: application/json" -X POST -d @create-wallet-1.json \
    http://127.0.0.1:8000/api/explorer/v1/transactions
```

This transaction creates the first wallet associated with user Alice.
The transaction endpoint returns the hash of the transaction:

```json
{
  "tx_hash": "75a9d95694f22823ae01a6feafb3d4e27b55b83bd6897aa581456ea5da382dde"
}
```

The node will show in the log that the first wallet has been created:

```none
Create the wallet: Wallet { pub_key: PublicKey(6CE29B2D),
                            name: "Alice", balance: 100 }
```

#### Create the Second Wallet

To create the second wallet put the code into `create-wallet-2.json` file:

```json
{
  "tx_body": "9359df9223bd4c263692a437e3d244b644c7b7f847db12cc556c2e25c73e61030000010000000a03426f62583236ff2afe268d31ca93ab0258cb3fea944551975d95888dbec88787fb5b1e23a044c4e674c6fbbb239ff7de83e8d3ba8ca57dc7e47a3eb52572f9dbd9df02"
}
```

Send it with `curl` to the node:

```sh
curl -H "Content-Type: application/json" -X POST -d @create-wallet-2.json \
    http://127.0.0.1:8000/api/explorer/v1/transactions
```

It returns the hash of the second transaction:

```json
{
  "tx_hash": "7a09053aa590704332b7a18f552150caa8b6e4f777afa4005d169038f481b7f7"
}
```

The node will show in the log that the second wallet has been created:

```none
Create the wallet: Wallet { pub_key: PublicKey(AE6A1C4E),
                            name: "Bob", balance: 100 }
```

#### Transfer Between Wallets

Now we have two wallets in the database and we can transfer money between them.
Create `transfer-funds.json` and add the following code to this file:

```json
{
  "tx_body": "114e49a764813f2e92609d103d90f23dc5b7e94e74b3e08134c1272441614bd90000010001000a220a209359df9223bd4c263692a437e3d244b644c7b7f847db12cc556c2e25c73e6103100f7611ddb5d15e4b77894fae770e5b15f19c07e0f7c7472e31fabe850f0067fb3ab4702130ba6325448d53516a8897a1d9228ba6a87b0e1224143c1b629c4d180b"
}
```

This transaction transfers 15 coins from the first wallet to the second.
Send it to the node with:

```sh
curl -H "Content-Type: application/json" -X POST -d @transfer-funds.json \
    http://127.0.0.1:8000/api/explorer/v1/transactions
```

This request returns the transaction hash:

```json
{
  "tx_hash": "ae3afbe35f1bfd102daea2f3f72884f04784a10aabe9d726749b1188a6b9fe9b"
}
```

The node outputs to the console the information about this transfer:

```none
Transfer between wallets: Wallet { pub_key: PublicKey(6CE29B2D),
                                   name: "Alice", balance: 85 }
                       => Wallet { pub_key: PublicKey(AE6A1C4E),
                                   name: "Bob", balance: 115 }
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
    "balance": "85",
    "name": "Alice",
    "pub_key": "114e49a764813f2e92609d103d90f23dc5b7e94e74b3e08134c1272441614bd9"
  },
  {
    "balance": "115",
    "name": "Bob",
    "pub_key": "9359df9223bd4c263692a437e3d244b644c7b7f847db12cc556c2e25c73e6103"
  }
]
```

#### Info on Specific Wallet

The second read endpoint also works:

```sh
curl "http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallet?\
pub_key=114e49a764813f2e92609d103d90f23dc5b7e94e74b3e08134c1272441614bd9"
```

The response is:

```json
{
  "balance": "85",
  "name": "Alice",
  "pub_key": "114e49a764813f2e92609d103d90f23dc5b7e94e74b3e08134c1272441614bd9"
}
```

## Conclusion

Hurray! 🎉 You have created the first fully functional Exonum blockchain
with two wallets and transferred some money between them. Next,
[we are going to test it](test-service.md).

[cryptocurrency]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency
[explorer]: ../advanced/node-management.md#transaction
[tx-info]: ../architecture/transactions.md#info
[rust-closure]: https://doc.rust-lang.org/book/first-edition/closures.html
[curry-fn]: https://en.wikipedia.org/wiki/Currying
[arc]: https://doc.rust-lang.org/std/sync/struct.Arc.html
[ref]: https://doc.rust-lang.org/std/cell/struct.Ref.html
[cargo-example]: http://doc.crates.io/manifest.html#examples
[lib.rs]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/src/lib.rs
[demo.rs]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/examples/demo.rs
[std-asref]: https://doc.rust-lang.org/std/convert/trait.AsRef.html
