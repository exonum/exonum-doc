# Advanced Cryptocurrency Tutorial: Service with Data Proofs

This tutorial is an extended version of the
[Cryptocurrency Tutorial](create-service.md).
It shows how to create cryptographic proofs for data in Exonum
and how to organize the corresponding data layout.

In this Exonum service we implement a cryptocurrency,
which allows the following operations:

- creating a wallet
- replenishing the wallet balance
- transferring money between wallets
- obtaining [cryptographic proofs](../architecture/merkledb.md#merkelized-indexes)
  of executed transactions
- reviewing wallets history.

You can view and download the full source code of this tutorial [here][demo].

!!! tip
    We suggest that you try to launch the simpler service first before
    proceeding with this tutorial as some
    steps are omitted here for the sake of smooth exposition.

Unlike its predecessor, the tutorial contains a [client part][demo-frontend],
which allows to interact with the service via any web browser.

## Create Rust Project

To build the service you must the
[Rust](https://rustup.rs/) compiler installed.
For the frontend part, you will also require [Node.js](https://nodejs.org/).

Create a crate with the **exonum** crate as a dependency.

```sh
cargo new cryptocurrency-advanced --lib
```

Add necessary dependencies to `Cargo.toml` in the project directory:

```toml
[dependencies]
exonum = "1.0.0-rc.1"
exonum-derive = "1.0.0-rc.1"
exonum-merkledb = "1.0.0-rc.1"
exonum-proto = "1.0.0-rc.1"
exonum-cli = "1.0.0-rc.1"
exonum-rust-runtime = "1.0.0-rc.1"

failure = "0.1.5"
protobuf = "2.8.0"
serde = "1.0.0"
serde_derive = "1.0.0"

# `dev-dependencies` skipped for brevity...

[build-dependencies]
exonum-build = "1.0.0-rc.1"
```

For convenience reasons we decided to divide the code into five submodules. Four
of them correspond to a certain part of the service business logic and one
describes Protobuf structures. Let’s announce them in the crate root (`lib.rs`):

```rust
pub mod api;
pub mod proto;
pub mod schema;
pub mod transactions;
pub mod wallet;
```

## Constants

Let’s define the constants to be used further:

```rust
/// Initial balance of the wallet.
pub const INITIAL_BALANCE: u64 = 100;
```

## Declare Persistent Data

Similarly to a simple cryptocurrency, we need to declare the data that we
will store in our blockchain, i.e. the `Wallet` type. Compared to the simple
demo, it will have additional fields:

```protobuf
message Wallet {
  exonum.crypto.Hash owner = 1;
  string name = 2;
  uint64 balance = 3;
  
  // Additional fields:
  // Number of transactions related to the wallet.
  uint64 history_len = 4;
  // `Hash` of the Merkelized list of the transactions
  // related to the wallet.
  exonum.crypto.Hash history_hash = 5;
}
```

These additional fields allow to prove to a light client that specific
transactions (and no other transactions) are related to the wallet,
that is, have changed its balance.

Note that the `owner` field has a different type compared to the simple
cryptocurrency. This is because we will use the general way to associate
wallets with the authorization info –
[*addresses*](../advanced/service-interaction.md#authorization-via-services),
which act similarly to addresses in Ethereum.
Since an address is the SHA-256 hash
of the authorization info, it is represented as `Hash` in Protobuf.

After that we provide the `Wallet` description in Rust in
`src/wallet.rs`. The service will require this Rust definition to
[validate](../architecture/serialization.md#additional-validation-for-protobuf-generated-structures)
the type generated from the above Protobuf declaration:

```rust
use exonum::{crypto::Hash, runtime::CallerAddress as Address};
use exonum_derive::{BinaryValue, ObjectHash};
use exonum_proto::ProtobufConvert;

use crate::proto;

/// Wallet information stored in the database.
#[derive(Clone, Debug, ProtobufConvert, BinaryValue, ObjectHash)]
#[protobuf_convert(source = "proto::Wallet", serde_pb_convert)]
pub struct Wallet {
    pub owner: Address,
    pub name: String,
    pub balance: u64,
    pub history_len: u64,
    pub history_hash: Hash,
}
```

We added `serde_pb_convert` to have JSON representation of our structure
similar to Protobuf declarations, it helps the light client handle proofs
that contain the `Wallet` structure.

We also implement a couple of auxiliary methods for `Wallet`: a constructor
and a balance setter.

??? "Wallet methods"
    ```rust
    impl Wallet {
        /// Creates a new wallet.
        pub fn new(
            owner: Address,
            name: &str,
            balance: u64,
            history_len: u64,
            &history_hash: &Hash,
        ) -> Self {
            Self {
                owner,
                name: name.to_owned(),
                balance,
                history_len,
                history_hash,
            }
        }

        /// Returns a copy of this wallet with updated balance.
        pub fn set_balance(self, balance: u64, history_hash: &Hash) -> Self {
            Self::new(
                self.owner,
                &self.name,
                balance,
                self.history_len + 1,
                history_hash,
            )
        }
    }
    ```

The setter is *immutable*; it consumes the old instance of the wallet and
produces a new instance with the
modified `balance` field. It is called within mutable methods allowing
manipulations with the wallet that will be specified below.

Similar to the simple tutorial, we need to add Protobuf code generation to
our project. Therefore, in `proto/mod.rs` we integrate the Protobuf-generated
files to the `proto` module of our project:

```rust
#![allow(bare_trait_objects)]

pub use self::service::{CreateWallet, Issue, Transfer, Wallet};

include!(concat!(env!("OUT_DIR"), "/protobuf_mod.rs"));
use exonum::crypto::proto::*;
```

Next, we generate the corresponding Rust files. For this we add the following
code in the `build.rs` script for the crate:

```rust
use exonum_build::ProtobufGenerator;

fn main() {
    ProtobufGenerator::with_mod_name("protobuf_mod.rs")
        .with_input_dir("src/proto")
        .with_crypto()
        .generate();
}
```

### Create Schema

As we already mentioned in the simple cryptocurrency tutorial, *schema* is a
structured view of the [key-value storage](../architecture/merkledb.md)
used in Exonum. For this tutorial, we will be production-aware and divide the schema
into 2 parts:

- **private part,** which will be available only to the crate
- **public part,** which will be exported from the crate and thus accessible
  to other services.

This split is similar to an idiomatic interface / implementation separation
in Java.
See [*Service Interaction*](../advanced/service-interaction.md#interaction-via-schemas)
for the reasoning behind this split.

```rust
#[derive(Debug, FromAccess)]
pub(crate) struct SchemaImpl<T: Access> {
    /// Public part of the schema.
    #[from_access(flatten)]
    pub public: Schema<T>,
    /// History for specific wallets.
    pub wallet_history: Group<T, Address, ProofListIndex<T::Base, Hash>>,
}

/// Public part of the cryptocurrency schema.
#[derive(Debug, FromAccess, RequireArtifact)]
pub struct Schema<T: Access> {
    /// Map of wallet keys to information about the corresponding account.
    pub wallets: RawProofMapIndex<T::Base, Address, Wallet>,
}
```

Several things to note here:

- `from_access(flatten)` attribute acts like `serde(flatten)`, allowing to embed
  the public schema fields directly into the private schema. This ensures
  that public and private schemas cannot diverge.
- `Group` declares an [index group](../architecture/merkledb.md#index-groups).
  In our case, indexes in the group are keyed by the `Address`
  (previously mentioned as unified authorization info).
- `RawProofMapIndex` denotes that the index
  [does not transform](../advanced/merkelized-map.md#proofmapindex-insights)
  its keys, which is appropriate for `Address` keys because they are essentially
  hash digests.

We also declare some helper methods to access schema data more efficiently:

```rust
impl<T: Access> SchemaImpl<T> {
    pub fn new(access: T) -> Self {
        Self::from_root(access).unwrap()
    }

    pub fn wallet(&self, address: Address) -> Option<Wallet> {
        self.public.wallets.get(&address)
    }
}
```

Besides the `new` constructor copied from the previous tutorial,
we define the `wallet` getter.

Finally, we define some methods to *modify* schema data:

```rust
impl<T> SchemaImpl<T>
where
    T: Access,
    T::Base: RawAccessMut,
{
    /// Increases balance of the wallet and appends new record to its history.
    pub fn increase_wallet_balance(
        &mut self,
        wallet: Wallet,
        amount: u64,
        transaction: Hash,
    ) {
        // actual implementation skipped
    }

    /// Decreases balance of the wallet and appends new record to its history.
    pub fn decrease_wallet_balance(
        &mut self,
        wallet: Wallet,
        amount: u64,
        transaction: Hash,
    ) {
        // actual implementation skipped
    }

    /// Creates a new wallet and appends the first record to its history.
    pub fn create_wallet(
        &mut self,
        key: Address,
        name: &str,
        transaction: Hash,
    ) {
        // actual implementation skipped
    }
}
```

Note the `T::Base: RawAccessMut` bound. `T::Base` denotes the *base*
or [raw access](../architecture/merkledb.md#accesses) to the storage, which
underpins `Access`. The bound expresses the requirement that this underlying
access (and thus, `T` itself) is mutable.

## Define Transactions

### Define Transaction Structures

We need three types of transactions; apart from
[the old ones](create-service.md#define-transactions)
(“create a new wallet” and “transfer money between wallets”)
we add a new transaction type that reimburses a wallet balance.
We start with describing these transactions in Protobuf:

```protobuf
message Transfer {
  exonum.crypto.Hash to = 1;
  uint64 amount = 2;
  uint64 seed = 3;
}

message Issue {
  uint64 amount = 1;
  uint64 seed = 2;
}

message CreateWallet {
  string name = 1;
}
```

Like in `Wallet.owner`, we use `Hash` in `Transfer.to`.

Based on the above Protobuf descriptions we prepare the corresponding
transaction descriptions in Rust.
We need to add `serde_pb_convert` to `Transfer` transaction derive attributes
to have JSON representation of this structure similar to Protobuf declarations.
Just as with the `Wallet` structure, it helps the light client handle proofs
that contain `Transfer` transaction.

??? "Rust transaction declarations"
    ```rust
    #[derive(Clone, Debug)]
    #[derive(ProtobufConvert, BinaryValue, ObjectHash)]
    #[protobuf_convert(source = "proto::Transfer", serde_pb_convert)]
    pub struct Transfer {
        pub to: Address,
        pub amount: u64,
        pub seed: u64,
    }

    #[derive(Clone, Debug)]
    #[derive(Serialize, Deserialize)]
    #[derive(ProtobufConvert, BinaryValue, ObjectHash)]
    #[protobuf_convert(source = "proto::Issue")]
    pub struct Issue {
        pub amount: u64,
        pub seed: u64,
    }

    #[derive(Clone, Debug)]
    #[derive(Serialize, Deserialize)]
    #[derive(ProtobufConvert, BinaryValue, ObjectHash)]
    #[protobuf_convert(source = "proto::CreateWallet")]
    pub struct CreateWallet {
        pub name: String,
    }
    ```

Like in the simple tutorial, we aggregate transactions into a single *interface*,
which our service will implement:

```rust
#[exonum_interface]
pub trait CryptocurrencyInterface<Ctx> {
    type Output;

    #[interface_method(id = 0)]
    fn transfer(&self, ctx: Ctx, arg: Transfer) -> Self::Output;
    #[interface_method(id = 1)]
    fn issue(&self, ctx: Ctx, arg: Issue) -> Self::Output;
    #[interface_method(id = 2)]
    fn create_wallet(&self, ctx: Ctx, arg: CreateWallet) -> Self::Output;
}
```

### Reporting Errors

Before implementing transaction logic we define the types of errors that might
occur during their execution. The code is identical to the
[one](create-service.md#reporting-errors) in the simple cryptocurrency tutorial.

??? "Error definitions"
    ```rust
    /// Error codes emitted by wallet transactions during execution.
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
        /// Sender are same as receiver.
        SenderSameAsReceiver = 4,
    }
    ```

### Transaction Execution

The principle of transaction execution remains the
[same](create-service.md#transaction-execution)
as in the previous tutorial. Namely,
we implement the service interface (`CryptocurrencyInterface`)
for our service. The service type is declared in `lib.rs`:

```rust
/// Cryptocurrency service implementation.
#[derive(Debug, ServiceDispatcher, ServiceFactory)]
#[service_dispatcher(implements("CryptocurrencyInterface"))]
#[service_factory(proto_sources = "proto")]
pub struct CryptocurrencyService;

impl Service for CryptocurrencyService {
    // empty for now
}
```

The verification logic for `CreateWallet` and `Transfer` transactions
is similar to their predecessors.

??? "CreateWallet transaction"
    ```rust
    fn create_wallet(
        &self,
        context: ExecutionContext<'_>,
        arg: CreateWallet,
    ) -> Self::Output {
        let (from, tx_hash) = extract_info(&context)?;

        let mut schema = SchemaImpl::new(context.service_data());
        if schema.wallet(from).is_none() {
            let name = &arg.name;
            schema.create_wallet(from, name, tx_hash);
            Ok(())
        } else {
            Err(Error::WalletAlreadyExists.into())
        }
    }
    ```

    The helper method `extract_info` extracts address and the transaction hash
    from the call. It is defined as follows:

    ```rust
    fn extract_info(
        context: &ExecutionContext<'_>,
    ) -> Result<(Address, Hash), ExecutionError> {
        let tx_hash = context
            .transaction_hash()
            .ok_or(CommonError::UnauthorizedCaller)?;
        let from = context.caller().address();
        Ok((from, tx_hash))
    }
    ```

??? "Transfer transaction"
    ```rust
    fn transfer(
        &self,
        context: ExecutionContext<'_>,
        arg: Transfer,
    ) -> Self::Output {
        let (from, tx_hash) = extract_info(&context)?;
        let mut schema = SchemaImpl::new(context.service_data());

        let amount = arg.amount;
        if from == arg.to {
            return Err(Error::SenderSameAsReceiver.into());
        }

        let sender = schema.wallet(from).ok_or(Error::SenderNotFound)?;
        let receiver = schema.wallet(arg.to).ok_or(Error::ReceiverNotFound)?;
        if sender.balance < amount {
            Err(Error::InsufficientCurrencyAmount.into())
        } else {
            schema.decrease_wallet_balance(sender, amount, tx_hash);
            schema.increase_wallet_balance(receiver, amount, tx_hash);
            Ok(())
        }
    }
    ```

Note that we no longer extract a public key from `context.caller()` and panic
if the caller is not authenticated by a key.
Instead, we convert the caller to an address. This approach will never panic
and thus is applicable to any kind of authorization (e.g., via a service).

The remaining transaction, `Issue`, is responsible for replenishment
of the wallet balance.  We use `increase_wallet_balance`
to put money to the wallet and record a new wallet instance in
the blockchain state:

```rust
fn issue(&self, context: ExecutionContext<'_>, arg: Issue) -> Self::Output {
    let (from, tx_hash) = extract_info(&context)?;

    let mut schema = SchemaImpl::new(context.service_data());
    if let Some(wallet) = schema.wallet(from) {
        let amount = arg.amount;
        schema.increase_wallet_balance(wallet, amount, tx_hash);
        Ok(())
    } else {
        Err(Error::ReceiverNotFound.into())
    }
}
```

## Implement API

Next, we need to implement the node API. The API will allow us not only to send
and
obtain the data stored in the blockchain but also will provide proofs of the
correctness of the returned data.

### Data Structures

First, we list the structures used by API. We need to define `WalletQuery`
structure which describes what information we
need to pass to the node to get response with information about specific wallet:

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct WalletQuery {
    /// Public key of the queried wallet.
    pub pub_key: PublicKey,
}
```

Besides this we also declare structures that
will be used for processing users’ requests:

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct WalletProof {
    /// Proof of the whole wallets table.
    pub to_table: MapProof<String, Hash>,
    /// Proof of the specific wallet in this table.
    pub to_wallet: MapProof<Address, Wallet, Raw>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WalletHistory {
    /// Proof of the list of transaction hashes.
    pub proof: ListProof<Hash>,
    /// List of above transactions.
    pub transactions: Vec<Verified<AnyTx>>,
}
```

`WalletProof.to_table` is a proof of the `wallets` index
from the service schema into
the [aggregated MerkleDB state](../architecture/merkledb.md#state-aggregation).
Due to how service storage is organized, the proven key will have
the form `${service_name}.wallets`, where `service_name` is
the name of the cryptocurrency service.

The following structure is what a user receives as
a response to his request. It is based on the previous auxiliary structures
and contains the information on
the wallet together with the
proofs of existence of the wallet and the correctness of its history.

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct WalletInfo {
    pub block_proof: BlockProof,
    pub wallet_proof: WalletProof,
    pub wallet_history: Option<WalletHistory>,
}
```

### Retrieving Proof for a Wallet

Now let’s define the method that will allow us to obtain information on a
particular wallet together with cryptographic
proof of its existence. The proofs also allow to confirm existence
of a particular transaction in the wallet history.

```rust
/// Public service API description.
#[derive(Debug, Clone, Copy)]
pub struct PublicApi;

impl PublicApi {
    pub fn wallet_info(
        state: &ServiceApiState<'_>,
        query: WalletQuery,
    ) -> api::Result<WalletInfo> {
        // Implementation is presented below.
    }
}
```

We first get a proof for the `wallets` table in the service schema:

```rust
let IndexProof {
    block_proof,
    index_proof,
    ..
} = state.data().proof_for_service_index("wallets").unwrap();
```

Note that you do not need to prefix the table name with the service name
here – it is done automatically.

Next, we fetch a proof of existence of a particular wallet inside
the `wallets` table and include both parts of the proof
into the `WalletProof` structure:

```rust
let currency_schema = SchemaImpl::new(state.service_data());
let address = Address::from_key(pub_key);
let to_wallet = currency_schema.public.wallets.get_proof(address);
let wallet_proof = WalletProof {
    to_table: index_proof,
    to_wallet,
};
```

As the final step, we extract the proof for the wallet history.
Note that the proof contains transaction hashes
rather than the transactions themselves. The transactions are stored
separately and are returned together with
the proof for user’s reference. This allows user to check correctness of the
provided proof.

We obtain the wallet history and the proof for all transaction hashes in it:

```rust
let wallet_history = wallet.map(|_| {
    let history = currency_schema.wallet_history.get(&address);
    let proof = history.get_range_proof(..);
```

Next, we obtain transaction data for each history hash and output transactions
in an array:

```rust
    let transactions = state.data().for_core().transactions();
    let transactions = history
        .iter()
        .map(|tx_hash| transactions.get(&tx_hash).unwrap())
        .collect();

    WalletHistory {
        proof,
        transactions,
    }
});

Ok(WalletInfo {
    block_proof,
    wallet_proof,
    wallet_history,
})
```

Here, `state.data().for_core()` returns the *core schema* (that is, schema
defined and managed in the [core](../glossary.md#core) itself).
In this schema, `transactions()` method gets the map between transaction hashes
and respective transactions.

We now have a complete proof for availability of a block in the blockchain, of a
certain wallet in the database and
said wallet’s history aggregated under the `WalletInfo` structure.

### Initialize Service Data

The endpoint handler above relies on the fact that the `wallets` index
exists, which is reflected in the `unwrap()` here:

```rust
state.data().proof_for_service_index("wallets").unwrap()
```

However, the index will not exist if no transactions of the service were
executed! Without the index, we cannot retrieve a proof for its existence.
We *could* return a proof of absence of the index from the endpoint handler,
but this would complicate the endpoint design and the corresponding
client checks.

We will use another option: initialize the index in the service constructor,
which is a part of the `Service` trait.

```rust
impl Service for CryptocurrencyService {
    fn initialize(
        &self,
        context: ExecutionContext<'_>,
        _params: Vec<u8>,
    ) -> Result<(), ExecutionError> {
        SchemaImpl::new(context.service_data());
        Ok(())
    }
}
```

With this explicit constructor, the `wallets` index is guaranteed to exist
during API calls.

### Wire API

We implement the `wire` method in `PublicApi` and define a single endpoint
within it:

```rust
impl PublicApi {
    pub fn wire(builder: &mut ServiceApiBuilder) {
        builder
            .public_scope()
            .endpoint("v1/wallets/info", Self::wallet_info);
    }
}
```

Finally, we need to modify a previously empty `Service` implementation
for our service to actually wire the API when the service is started:

```rust
impl Service for CryptocurrencyService {
    // `initilize` method snipped...

    fn wire_api(&self, builder: &mut ServiceApiBuilder) {
        CryptocurrencyApi::wire(builder);
    }
}
```

### Default Instantiation Params

Similar to the [previous tutorial](create-service.md#default-instantiation-params),
we define default identifiers for the service to aid with its instantiation:

```rust
impl DefaultInstance for CryptocurrencyService {
    const INSTANCE_ID: InstanceId = 3;
    const INSTANCE_NAME: &'static str = "crypto";
}
```

## Running Service

We have now described all the structural parts of our demo. The last step is to
create a binary target via creating a `main.rs` file and introduce the `main` function
that will launch the blockchain with our [service artifact](../glossary.md#artifact):

```rust
use exonum_cli::NodeBuilder;
use exonum_cryptocurrency_advanced as cryptocurrency;

fn main() -> Result<(), failure::Error> {
    exonum::helpers::init_logger().unwrap();
    NodeBuilder::new()
        .with_default_rust_service(CryptocurrencyService)
        .run()
}
```

As soon as you launch the demo with the `cargo run` command, the `NodeBuilder`
will start to configure the network,
i.e. generate nodes, create their public and private keys, exchange keys between
nodes, etc. The service will be instantiated with the default identifiers
defined as per [`DefaultInstance` implementation](#default-instantiation-params).

Note that unlike the previous tutorial, we use `NodeBuilder::new()` rather
than `NodeBuilder::development_node()`. The `new` constructor takes arguments
from the command line to determine what exactly the node should do: run,
create initial node configuration, etc. That is, `NodeBuilder::new()` is
more flexible and fit for full-scale applications. For example, it can be used
to set up and launch a multi-node network.

!!! tip
    To run a single-node development network, launch the executable with
    the `run-dev` command:

    ```sh
    cargo run -- run-dev
    ```

    Use the `--help` option to find out other commands, and `<command> --help` to
    get help on a specific command.

## Conclusion

Good job! You have set up, described and launched an extended version of a
fully functional Exonum service!

Next you can see how to interact with the service with the help of the Exonum
[light client](light-client.md).

[demo]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced
[demo-frontend]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced/frontend
[launcher]: https://github.com/exonum/exonum-launcher
