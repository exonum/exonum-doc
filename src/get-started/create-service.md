---
title: Service development tutorial
---
# Cryptocurrency Tutorial: How to Create Services

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

## Create Rust Project

Exonum is written in Rust and you have to install the stable Rust
compiler to build this tutorial. If you do not have the environment set up, follow
[the installation guide](./install.md).

Let’s create a minimal crate with the **exonum** crate as a dependency.

```sh
cargo new cryptocurrency
```

Add necessary dependencies to `Cargo.toml` in the project directory:

```toml
[package]
name = "exonum_cryptocurrency"
version = "0.0.0"
authors = ["Your Name <your@email.com>"]

[dependencies]
exonum = "0.9.0"
serde = "1.0.0"
serde_json = "1.0.0"
serde_derive = "1.0.0"
failure = "0.1.1"
```

## Imports

Rust crates have the [`src/lib.rs`][lib.rs] file as the default entry point.
In our case, this is where we are going to place the service code.
Let’s start with importing crates with necessary types:

??? note "Imports"
    ```rust
    #[macro_use]
    extern crate exonum;
    #[macro_use]
    extern crate failure;
    extern crate serde;
    #[macro_use]
    extern crate serde_derive;
    extern crate serde_json;
    use exonum::api::{ServiceApiState, ServiceApiBuilder, self};
    use exonum::blockchain::{Blockchain, ExecutionError,
                             ExecutionResult, Service, Transaction,
                             TransactionSet};
    use exonum::crypto::{Hash, PublicKey};
    use exonum::encoding;
    use exonum::encoding::serialize::FromHex;
    use exonum::messages::{Message, RawTransaction};
    use exonum::node::{ApiSender, TransactionSend};
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

We should declare what kind of data the service will store in the blockchain.
In our case we need to declare a single type – *wallet*.
Inside the wallet we want to store:

- **Public key** to validate requests from the owner of the wallet
- **Name of the owner** (purely for convenience reasons)
- **Current balance** of the wallet

Summing it all up, the `Wallet` datatype will look like:

```rust
encoding_struct! {
    struct Wallet {
        pub_key: &PublicKey,
        name: &str,
        balance: u64,
    }
}
```

Macro `encoding_struct!` helps declare a
[serializable](../architecture/serialization.md)
struct and determine bounds of its fields. We need to change the wallet balance,
so we add methods to the `Wallet` type:

```rust
impl Wallet {
    pub fn increase(self, amount: u64) -> Self {
        let balance = self.balance() + amount;
        Self::new(self.pub_key(), self.name(), balance)
    }

    pub fn decrease(self, amount: u64) -> Self {
        let balance = self.balance() - amount;
        Self::new(self.pub_key(), self.name(), balance)
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
in [read requests](../architecture/services.md#read-requests), and `Fork`
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

    pub fn wallets(&self) -> MapIndex<&Snapshot, PublicKey, Wallet> {
        MapIndex::new("cryptocurrency.wallets", self.view.as_ref())
    }

    // Utility method to quickly get a separate wallet from the storage
    pub fn wallet(&self, pub_key: &PublicKey) -> Option<Wallet> {
        self.wallets().get(pub_key)
    }
}
```

Here, we have declared a constructor and two getter methods for the schema
wrapping any type that allows accessing it as a `Snapshot` reference
(that is, implements the [`AsRef`][std-asref] trait from the standard library).
`Fork` implements this trait, which means that we can construct a `CurrencySchema`
instance above the `Fork`, and use `wallets` and `wallet` getters for it.

For `Fork`-based schema, we declare an additional method to write to the storage:

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
- Transfer money between two different wallets

Service transactions are defined through `transactions!` macro
that automatically assigns transaction IDs based on the declaration order:

```rust
transactions! {
    // Transaction group.
    pub CurrencyTransactions {
        const SERVICE_ID = SERVICE_ID;

        // Transaction type for creating a new wallet.
        struct TxCreateWallet {
            pub_key: &PublicKey,
            name: &str,
        }

        // Transaction type for transferring tokens between two wallets.
        struct TxTransfer {
            from: &PublicKey,
            to: &PublicKey,
            amount: u64,
            seed: u64,
        }
    }
}
```

The transaction to create a new wallet (`TxCreateWallet`) contains
the public key of the wallet and the name of the user who created this wallet.

The transaction to transfer coins between different wallets (`TxTransfer`)
involves two public keys: for the sender’s wallet (`from`) and
for the receiver’s one (`to`). It also contains the amount of money to move
between them. We add the `seed` field to make sure that our transaction is
[impossible to replay](../architecture/transactions.md#non-replayability).

### Reporting Errors

The execution of the transaction may be unsuccessful for some reason.
For example, the transaction `TxCreateWallet` will not be executed
if the wallet with such public key already exists.
There are also three reasons why the transaction `TxTransfer` cannot be executed:

- There is no sender with a given public key
- There is no recipient with a given public key
- The sender has insufficient currency amount

Let’s define the codes of the above errors:

```rust
#[derive(Debug, Fail)]
#[repr(u8)]
pub enum Error {
    #[fail(display = "Wallet already exists")]
    WalletAlreadyExists = 0,

    #[fail(display = "Sender doesn't exist")]
    SenderNotFound = 1,

    #[fail(display = "Receiver doesn't exist")]
    ReceiverNotFound = 2,

    #[fail(display = "Insufficient currency amount")]
    InsufficientCurrencyAmount = 3,
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
This trait includes the `verify` method to verify the integrity of the
transaction, and the `execute` method which contains logic applied to the
storage when a transaction is executed.

In our case, `verify` for both transaction types will check the transaction
signature. `execute` method gets the reference to the `Fork` of the storage, so
we wrap it with our `CurrencySchema` to access our data layout.

For creating a wallet, we check that the wallet does not exist and add a new
wallet if so:

```rust
impl Transaction for TxCreateWallet {
    fn verify(&self) -> bool {
        self.verify_signature(self.pub_key())
    }

    fn execute(&self, view: &mut Fork) -> ExecutionResult {
        let mut schema = CurrencySchema::new(view);
        if schema.wallet(self.pub_key()).is_none() {
            let wallet = Wallet::new(self.pub_key(), self.name(), INIT_BALANCE);
            println!("Create the wallet: {:?}", wallet);
            schema.wallets_mut().put(self.pub_key(), wallet);
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
    fn verify(&self) -> bool {
         (*self.from() != *self.to()) &&
             self.verify_signature(self.from())
    }

    fn execute(&self, view: &mut Fork) -> ExecutionResult {
        let mut schema = CurrencySchema::new(view);

        let sender = match schema.wallet(self.from()) {
            Some(val) => val,
            None => Err(Error::SenderNotFound)?,
        };

        let receiver = match schema.wallet(self.to()) {
            Some(val) => val,
            None => Err(Error::ReceiverNotFound)?,
        };

        let amount = self.amount();
        if sender.balance() >= amount {
            let sender = sender.decrease(amount);
            let receiver = receiver.increase(amount);
            println!("Transfer between wallets: {:?} => {:?}", sender, receiver);
            let mut wallets = schema.wallets_mut();
            wallets.put(self.from(), sender);
            wallets.put(self.to(), receiver);
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
Besides the channel, it also contains a blockchain instance, which will be needed
to implement [read requests](../architecture/services.md#read-requests).

```rust
struct CryptocurrencyApi;
```

### API for Transactions

The core processing logic is essentially the same for both types of transactions:

1. Convert JSON input into a `Transaction`
2. Send the transaction to the channel, so that it will be broadcasted over the
  blockchain network and included into the block.
3. Synchronously respond with a hash of the transaction

This logic can be encapsulated in a method in `CryptocurrencyApi`:

```rust
#[derive(Serialize, Deserialize)]
pub struct TransactionResponse {
    // Hash of the transaction.
    pub tx_hash: Hash,
}

impl CryptocurrencyApi {
    fn post_transaction(state: &ServiceApiState, query: CurrencyTransactions)
     -> api::Result<TransactionResponse> {
        let transaction: Box<Transaction> = query.into();
        let tx_hash = transaction.hash();
        state.sender().send(transaction)?;
        Ok(TransactionResponse { tx_hash })
    }
}
```

### API for Read Requests

We want to implement 2 read requests:

- Return the information about all wallets in the system;
- Return the information about a specific wallet identified by the public key.

To accomplish this, we define a couple of corresponding methods in
`CryptocurrencyApi` that use `state` to read information from the blockchain storage.
For parsing a public key of a specific wallet we define a helper structure.

```rust
#[derive(Deserialize)]
/// The structure describes the query parameters for the `get_wallet` endpoint.
struct WalletQuery {
    /// Public key of the queried wallet.
    pub_key: PublicKey,
}

impl CryptocurrencyApi {
    /// Endpoint for getting a single wallet.
    fn get_wallet(state: &ServiceApiState, query: WalletQuery)
     -> api::Result<Wallet> {
        let snapshot = state.snapshot();
        let schema = CurrencySchema::new(snapshot);
        schema
            .wallet(&query.pub_key)
            .ok_or_else(|| api::Error::NotFound("Wallet not found".to_owned()))
    }

    /// Endpoint for dumping all wallets from the storage.
    fn get_wallets(state: &ServiceApiState, _query: ())
     -> api::Result<Vec<Wallet>> {
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

As the final step of the API implementation, we need to tie request
processing logic to specific endpoints.
We do this in the `CryptocurrencyApi::wire()` method:

```rust
impl CryptocurrencyApi {
    fn wire(builder: &mut ServiceApiBuilder) {
        // Binds handlers to specific routes.
        builder
            .public_scope()
            // Read only endpoints uses `GET` method.
            .endpoint("v1/wallet", Self::get_wallet)
            .endpoint("v1/wallets", Self::get_wallets)
            // But for methods that can modify service state you should use
            // `endpoint_mut` that uses `POST` method.
            .endpoint_mut("v1/wallets", Self::post_transaction)
            .endpoint_mut("v1/wallets/transfer", Self::post_transaction);
    }
}
```

## Define Service

Service is a group of templated transactions (we have defined them before). It
has a name and a unique id to determine the service inside the blockchain.

```rust
pub struct CurrencyService;
```

To turn `CurrencyService` into a blockchain service,
we should implement the `Service` trait in it.

!!! tip
    Read more on how to turn a type into a blockchain service in the
    [Interface with Exonum Framework](../architecture/services.md#interface-with-exonum-framework)
    section.

The two methods of the `Service` trait are simple:

- `service_name` returns the name of our service
- `service_id` returns the unique id of our service
   (i.e., the `SERVICE_ID` constant)

The `tx_from_raw` method is used to deserialize transactions
coming to the node.
If the incoming transaction is built successfully, we put it into a `Box<_>`.

The `state_hash` method is used to calculate the hash of
[the blockchain state](../glossary.md#blockchain-state). The method
should return [a vector of hashes](../architecture/services.md#state-hash) of the
[Merkelized service tables](../glossary.md#merkelized-indices).
As the wallets table is not Merkelized (a simplifying assumption discussed at the
beginning of the tutorial), the returned value should be an empty vector, `vec![]`.

The remaining method, `wire_api`, binds APIs defined by the service.
We will use it to receive transactions via REST API using the logic we defined
in `CryptocurrencyApi` earlier.

```rust
impl Service for CurrencyService {
    fn service_name(&self) -> &'static str { "cryptocurrency" }

    fn service_id(&self) -> u16 { SERVICE_ID }

    fn tx_from_raw(&self, raw: RawTransaction) ->
        Result<Box<Transaction>, encoding::Error>
    {
        let tx = CurrencyTransactions::tx_from_raw(raw)?;
        Ok(tx.into())
    }

    fn state_hash(&self, _: &Snapshot) -> Vec<Hash> {
        vec![]
    }

    fn wire_api(&self, builder: &mut ServiceApiBuilder) {
        CryptocurrencyApi::wire(builder)
    }
}
```

`CryptocurrencyApi` has `wire` method and we can use it to connect
this API instance to the `ServiceApiBuilder`.

## Create Demo Blockchain

The service is ready. You can verify that the library code compiles by running
`cargo build` in the shell. However, we do not have the means of processing requests
to the service. To fix this, let us create a minimalistic blockchain network
with one node and a single service we’ve just finished creating.

The code we are going to write is logically separate from the service itself.
The service library could be connected to an Exonum-powered blockchain
together with other services,
while the demo blockchain is a specific example of its usage. For this reason,
we will position the blockchain code as an [*example*][cargo-example] and
place it into [`examples/demo.rs`][demo.rs].

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
let peer_address = "0.0.0.0:2000".parse().unwrap();

// Return this value from `node_config` function
NodeConfig {
    listen_address: peer_address,
    peers: vec![],
    service_public_key,
    service_secret_key,
    consensus_public_key,
    consensus_secret_key,
    genesis,
    external_address: None,
    network: Default::default(),
    whitelist: Default::default(),
    api: api_cfg,
    mempool: Default::default(),
    services_configs: Default::default(),
}
```

### Run Node

Finally, we need to implement the entry point to our demo network – `main` function:

```rust
fn main() {
    exonum::helpers::init_logger().unwrap();
    let node = Node::new(
        MemoryDB::new(),
        vec![Box::new(CurrencyService)],
        node_config(),
    );
    node.run().unwrap();
}
```

That is, we:

1. Initialize logging in the Exonum core library
2. Create a node with in-memory database (`MemoryDB`), a single service (`CurrencyService`),
  and the configuration we have specified earlier
3. Run the created node

The demo blockchain can now be executed with the `cargo run --example demo` command.

## Interact With Blockchain

### Send Transactions via REST API

Let’s send some transactions to our demo blockchain.

#### Create the First Wallet

Create `create-wallet-1.json` file and insert the following code into it:

```json
{
  "body": {
    "pub_key": "6ce29b2d3ecadc434107ce52c287001c968a1b6eca3e5a1eb62a2419e2924b85",
    "name": "Alice"
  },
  "protocol_version": 0,
  "service_id": 1,
  "message_id": 0,
  "signature": "9f684227f1de663775848b3db656bca685e085391e2b00b0e115679fd45443ef58a5abeb555ab3d5f7a3cd27955a2079e5fd486743f36515c8e5bea07992100b"
}
```

Use the `curl` command to send this transaction to the node by HTTP:

```sh
curl -H "Content-Type: application/json" -X POST -d @create-wallet-1.json \
    http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets
```

This transaction creates the first wallet associated with user Alice.
The transaction endpoint returns the hash of the transaction:

```json
{
  "tx_hash": "099d455ab563505cad55b7c6ec02e8a52bca86b0c4446d9879af70f5ceca5dd8"
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
  "body": {
    "pub_key": "ae6a1c4e84886999dfec7f4d792bf133e7beacf974c000fe45c443727df49df2",
    "name": "Bob"
  },
  "protocol_version": 0,
  "service_id": 1,
  "message_id": 0,
  "signature": "059f0a281ab63e00839310db8ba680ca550c9f6e3ccc9463dc7a8a82342f70bdbdc8237f6af9d20bbcd3ad5547c3f24d2dc80fcd9c954e087a80742f995e160c"
}
```

Send it with `curl` to the node:

```sh
curl -H "Content-Type: application/json" -X POST -d @create-wallet-2.json \
    http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets
```

It returns the hash of the second transaction:

```json
{
  "tx_hash": "2fb289b9928f5a75acf261cc1e61fd654fcb63bf285688f0fc8e59f44dede048"
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
  "body": {
    "from": "6ce29b2d3ecadc434107ce52c287001c968a1b6eca3e5a1eb62a2419e2924b85",
    "to": "ae6a1c4e84886999dfec7f4d792bf133e7beacf974c000fe45c443727df49df2",
    "amount": "15",
    "seed": "0"
  },
  "protocol_version": 0,
  "service_id": 1,
  "message_id": 1,
  "signature": "2c234680adaa67f1e6573895f1557230ea5373b0972f8aa714611f78931c4bae49680580d41ac806977a7a4f9556781018f1061c9be4adcaabc3760c5a92a70b"
}
```

This transaction transfers 15 coins from the first wallet to the second.
Send it to the node with:

```sh
curl -H "Content-Type: application/json" -X POST -d @transfer-funds.json \
    http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets/transfer
```

This request returns the transaction hash:

```json
{
  "tx_hash": "4d6de957f58c894db2dca577d4fdd0da1249a8dff1df5eb69d23458e43320ee2"
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
    "pub_key": "6ce29b2d3ecadc434107ce52c287001c968a1b6eca3e5a1eb62a2419e2924b85"
  },
  {
    "balance": "115",
    "name": "Bob",
    "pub_key": "ae6a1c4e84886999dfec7f4d792bf133e7beacf974c000fe45c443727df49df2"
  }
]
```

#### Info on Specific Wallet

The second read endpoint also works:

```sh
curl "http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallet?\
pub_key=6ce29b2d3ecadc434107ce52c287001c968a1b6eca3e5a1eb62a2419e2924b85"
```

The response is:

```json
{
  "balance": "85",
  "name": "Alice",
  "pub_key": "6ce29b2d3ecadc434107ce52c287001c968a1b6eca3e5a1eb62a2419e2924b85"
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
