---
title: Service development tutorial
---
# Cryptocurrency Tutorial: How to Create Services

In this tutorial we create an Exonum service that implements
a minimalistic cryptocurrency, and a single-node blockchain network processing
requests to this service. The service accepts two types of transactions:
creates a wallet with a default balance and transfers money between wallets.

You can view and download the full source code of this tutorial
[here](https://github.com/exonum/cryptocurrency).

For didactic purposes, the
tutorial is simplified compared to a real-life application; it does not feature
the client part and does not use [Merkelized data collections](../architecture/storage.md#merkelized-indices).
A tutorial adding these features is coming soon.

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
# Tutorial version corresponds to the compatible version of Exonum core library
version = "0.5.0"
authors = ["Your Name <your@email.com>"]

[dependencies]
exonum = "0.5.0"
iron = "0.6.0"
bodyparser = "0.8.0"
router = "0.6.0"
serde = "1.0"
serde_json = "1.0"
```

## Imports

Rust crates have the [`src/lib.rs`][lib.rs] file as the default entry point.
In our case, this is where we are going to place the service code.
Let’s start with importing crates with necessary types:

```rust
extern crate serde;
#[macro_use] extern crate serde_json;
#[macro_use] extern crate exonum;
extern crate router;
extern crate bodyparser;
extern crate iron;

use exonum::blockchain::{Blockchain, Service, Transaction, ApiContext};
use exonum::encoding::serialize::FromHex;
use exonum::node::{TransactionSend, ApiSender};
use exonum::messages::{RawTransaction, Message};
use exonum::storage::{Fork, MapIndex, Snapshot};
use exonum::crypto::{Hash, PublicKey};
use exonum::encoding;
use exonum::api::{Api, ApiError};
use iron::prelude::*;
use iron::Handler;
use router::Router;
use serde::Deserialize;
```

## Constants

Let’s define some constants we will use later on:

```rust
// Service identifier
const SERVICE_ID: u16 = 1;
// Identifier for wallet creation transaction type
const TX_CREATE_WALLET_ID: u16 = 1;
// Identifier for coins transfer transaction type
const TX_TRANSFER_ID: u16 = 2;
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

For our cryptocurrency tutorial we need two transaction types:

- Create a new wallet and add some money to it
- Transfer money between two different wallets

Declaration of any transaction should contain:

- Service identifier
- Unique (within the service) message identifier
- Size of the fixed part of the message

Exonum will use these constants for (de)serialization of messages.

### Creating New Wallet

A Transaction to create a new wallet should contain the public key of the wallet
and the name of the user who created this wallet:

```rust
message! {
    struct TxCreateWallet {
        const TYPE = SERVICE_ID;
        const ID = TX_CREATE_WALLET_ID;

        pub_key: &PublicKey,
        name: &str,
    }
}
```

### Transferring Coins

Transaction to transfer coins between different wallets is declared as follows:

```rust
message! {
    struct TxTransfer {
        const TYPE = SERVICE_ID;
        const ID = TX_TRANSFER_ID;

        from: &PublicKey,
        to: &PublicKey,
        amount: u64,
        seed: u64,
    }
}
```

The transaction involves two public keys: for the sender’s wallet (`from`) and
for the receiver’s one (`to`). It also contains the amount of money to move
between them. We add the `seed` field to make sure that our transaction is
[impossible to replay](../architecture/transactions.md#non-replayability).

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

    fn execute(&self, view: &mut Fork) {
        let mut schema = CurrencySchema::new(view);
        if schema.wallet(self.pub_key()).is_none() {
            let wallet = Wallet::new(
                self.pub_key(),
                self.name(),
                INIT_BALANCE);
            println!("Create the wallet: {:?}", wallet);
            schema.wallets_mut().put(self.pub_key(), wallet);
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

    fn execute(&self, view: &mut Fork) {
        let mut schema = CurrencySchema { view };
        let sender = schema.wallet(self.from());
        let receiver = schema.wallet(self.to());
        if let (Some(sender), Some(receiver)) = (sender, receiver) {
            let amount = self.amount();
            if sender.balance() >= amount {
                let sender = sender.decrease(amount);
                let receiver = receiver.increase(amount);
                println!("Transfer between wallets: {:?} => {:?}",
                    sender,
                    receiver);
                let mut wallets = schema.wallets_mut();
                wallets.put(self.from(), sender);
                wallets.put(self.to(), receiver);
            }
        }
    }
}
```

## Implement API

Next, we need to implement the node API with the help of [Iron framework][iron].
With this aim we declare a struct which implements the `Api` trait.
The struct will contain a channel, i.e. a connection to the blockchain node
instance.
Besides the channel, the API struct will contain a blockchain instance;
it will be needed to implement
[read requests](../architecture/services.md#read-requests).

```rust
#[derive(Clone)]
struct CryptocurrencyApi {
    channel: ApiSender,
    blockchain: Blockchain,
}
```

### API for Transactions

The core processing logic is essentially the same for both types of transactions:

1. Convert JSON input into a `Transaction`
2. Send the transaction to the channel, so that it will be broadcasted over the
  blockchain network and included into the block.
3. Synchronously respond with a hash of the transaction

This logic can be encapsulated in a parameterized method in `CryptocurrencyApi`:

```rust
impl CryptocurrencyApi {
    fn post_transaction<T>(&self, req: &mut Request) -> IronResult<Response>
    where
        T: Transaction + Clone + for<'de> Deserialize<'de>,
    {
        match req.get::<bodyparser::Struct<T>>() {
            Ok(Some(transaction)) => {
                let transaction: Box<Transaction> = Box::new(transaction);
                let tx_hash = transaction.hash();
                self.channel.send(transaction).map_err(ApiError::from)?;
                self.ok_response(&json!({
                    "tx_hash": tx_hash
                }))
            }
            Ok(None) => Err(ApiError::IncorrectRequest(
                "Empty request body".into(),
            ))?,
            Err(e) => Err(ApiError::IncorrectRequest(Box::new(e)))?,
        }
    }
}
```

Type parameter `T` (the transaction type) determines
the output type for JSON parsing, which is performed with the help
of the [`bodyparser`][bodyparser] plugin for Iron.

Notice that the `post_transaction()` method has an idiomatic signature
`fn(&self, &mut Request) -> IronResult<Response>`,
making it close to Iron’s [`Handler`][iron-handler]. This is to be
expected; the method *is* a handler for processing transaction-related requests.

### API for Read Requests

We want to implement 2 read requests:

- Return the information about all wallets in the system;
- Return the information about a specific wallet identified by the public key.

To accomplish this, we define a couple of corresponding methods in
`CryptocurrencyApi`
that use its `blockchain` field to read information from the blockchain storage.

```rust
impl CryptocurrencyApi {
    fn get_wallet(&self, req: &mut Request) -> IronResult<Response> {
        let path = req.url.path();
        let wallet_key = path.last().unwrap();
        let public_key = PublicKey::from_hex(wallet_key)
            .map_err(ApiError::FromHex)?;

        let wallet = {
            let snapshot = self.blockchain.snapshot();
            let schema = CurrencySchema::new(snapshot);
            schema.wallet(&public_key)
        };

        if let Some(wallet) = wallet {
            self.ok_response(&serde_json::to_value(wallet).unwrap())
        } else {
            self.not_found_response(
                &serde_json::to_value("Wallet not found").unwrap(),
            )
        }
    }

    fn get_wallets(&self, _: &mut Request) -> IronResult<Response> {
        let snapshot = self.blockchain.snapshot();
        let schema = CurrencySchema::new(snapshot);
        let idx = schema.wallets();
        let wallets: Vec<Wallet> = idx.values().collect();
        self.ok_response(&serde_json::to_value(&wallets).unwrap())
    }
}
```

As with the transaction endpoint, the methods have an idiomatic signature
`fn(&self, &mut Request) -> IronResult<Response>`.

### Wire API

As the final step of the API implementation, we need to tie request processing logic to
specific endpoints. We do this in the `CryptocurrencyApi::wire()`
method:

```rust
impl Api for CryptocurrencyApi {
    fn wire(&self, router: &mut Router) {
        let self_ = self.clone();
        let post_create_wallet = move |req: &mut Request| {
            self_.post_transaction::<TxCreateWallet>(req)
        };
        let self_ = self.clone();
        let post_transfer = move |req: &mut Request| {
            self_.post_transaction::<TxTransfer>(req)
        };
        let self_ = self.clone();
        let get_wallets = move |req: &mut Request| self_.get_wallets(req);
        let self_ = self.clone();
        let get_wallet = move |req: &mut Request| self_.get_wallet(req);

        // Bind handlers to specific routes.
        router.post("/v1/wallets", post_create_wallet, "post_create_wallet");
        router.post("/v1/wallets/transfer", post_transfer, "post_transfer");
        router.get("/v1/wallets", get_wallets, "get_wallets");
        router.get("/v1/wallet/:pub_key", get_wallet, "get_wallet");
    }
}
```

We create a [closure][rust-closure] for each endpoint, converting handlers
that we have defined, with a type signature
`fn(&CryptocurrencyApi, &mut Request) -> IronResult<Response>`,
to ones that Iron supports – `Fn(&mut Request) -> IronResult<Response>`.
This can be accomplished by [currying][curry-fn], that is,
cloning `CryptocurrencyApi` and moving it into each closure.
For this to work, note that cloning a `Blockchain` does not create
a new blockchain from scratch,
but rather produces a reference to the same blockchain instance.
(That is, `Blockchain` is essentially a smart pointer type similar to [`Arc`][arc]
or [`Ref`][ref].)

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
coming to the node. To choose the right deserializer, we can use
`message_type()` to get the unique identifier of the message we declared before.
If the incoming transaction is built successfully, we put it into a `Box<_>`.

The `state_hash` method is used to calculate the hash of
[the blockchain state](../glossary.md#blockchain-state). The method
should return [a vector of hashes](../architecture/services.md#state-hash) of the
[Merkelized service tables](../glossary.md#merkelized-indices).
As the wallets table is not Merkelized (a simplifying assumption discussed at the
beginning of the tutorial), the returned value should be an empty vector, `vec![]`.

The remaining method, `public_api_handler`, creates a REST `Handler` to process
web requests to the node. We will use it to receive transactions via REST API
using the logic we defined in `CryptocurrencyApi` earlier.

```rust
impl Service for CurrencyService {
    fn service_name(&self) -> &'static str { "cryptocurrency" }

    fn service_id(&self) -> u16 { SERVICE_ID }

    fn tx_from_raw(&self, raw: RawTransaction)
        -> Result<Box<Transaction>, encoding::Error> {

        let trans: Box<Transaction> = match raw.message_type() {
            TX_TRANSFER_ID => Box::new(TxTransfer::from_raw(raw)?),
            TX_CREATE_WALLET_ID => Box::new(TxCreateWallet::from_raw(raw)?),
            _ => {
                return Err(encoding::Error::IncorrectMessageType {
                    message_type: raw.message_type()
                });
            },
        };
        Ok(trans)
    }

    fn state_hash(&self, _: &Snapshot) -> Vec<Hash> {
        vec![]
    }

    fn public_api_handler(&self, ctx: &ApiContext) -> Option<Box<Handler>> {
        let mut router = Router::new();
        let api = CryptocurrencyApi {
            channel: ctx.node_channel().clone(),
            blockchain: ctx.blockchain().clone(),
        };
        api.wire(&mut router);
        Some(Box::new(router))
    }
}
```

`CryptocurrencyApi` type implements `Api` trait of Exonum and we can use
`Api::wire` method to connect this `Api` instance to the `Router`.

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
        Box::new(MemoryDB::new()),
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
    "pub_key": "03e657ae71e51be60a45b4bd20bcf79ff52f0c037ae6da0540a0e0066132b472",
    "name": "Johnny Doe"
  },
  "network_id": 0,
  "protocol_version": 0,
  "service_id": 1,
  "message_id": 1,
  "signature": "ad5efdb52e48309df9aa582e67372bb3ae67828c5eaa1a7a5e387597174055d315eaa7879912d0509acf17f06a23b7f13f242017b354f682d85930fa28240402"
}
```

Use the `curl` command to send this transaction to the node by HTTP:

```sh
curl -H "Content-Type: application/json" -X POST -d @create-wallet-1.json \
    http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets
```

This transaction creates the first wallet associated with user Johnny Doe.
The transaction endpoint returns the hash of the transaction:

```json
{
  "tx_hash": "44c6c2c58eaab71f8d627d75ca72f244289bc84586a7fb42186a676b2ec4626b"
}
```

The node will show in the log that the first wallet has been created:

```none
Create the wallet: Wallet { pub_key: PublicKey(3E657AE),
                            name: "Johnny Doe", balance: 100 }
```

#### Create the Second Wallet

To create the second wallet put the code into `create-wallet-2.json` file:

```json
{
  "body": {
    "pub_key": "d1e877472a4585d515b13f52ae7bfded1ccea511816d7772cb17e1ab20830819",
    "name": "Janie Roe"
  },
  "network_id": 0,
  "protocol_version": 0,
  "service_id": 1,
  "message_id": 1,
  "signature": "05f51eb13cfaaebc97b27e340048f35f40c7bb6e3ae4c47728dee9908a10636add57700dfce1bcd686dc36fae4fa930d1318fb76a0d5c410b998be1949382209"
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
  "tx_hash": "8714e90607afc05f43b82c475c883a484eecf2193df97b243b0d8630812863fd"
}
```

The node will show in the log that the second wallet has been created:

```none
Create the wallet: Wallet { pub_key: PublicKey(D1E87747),
                            name: "Janie Roe", balance: 100 }
```

#### Transfer Between Wallets

Now we have two wallets in the database and we can transfer money between them.
Create `transfer-funds.json` and add the following code to this file:

```json
{
  "body": {
    "from": "03e657ae71e51be60a45b4bd20bcf79ff52f0c037ae6da0540a0e0066132b472",
    "to": "d1e877472a4585d515b13f52ae7bfded1ccea511816d7772cb17e1ab20830819",
    "amount": "10",
    "seed": "12623766328194547469"
  },
  "network_id": 0,
  "protocol_version": 0,
  "service_id": 1,
  "message_id": 2,
  "signature": "2c5e9eee1b526299770b3677ffd0d727f693ee181540e1914f5a84801dfd410967fce4c22eda621701c2b9c676ed62bc48df9c973462a8514ffb32bec202f103"
}
```

This transaction transfers 10 coins from the first wallet to the second.
Send it to the node with:

```sh
curl -H "Content-Type: application/json" -X POST -d @transfer-funds.json \
    http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets/transfer
```

This request returns the transaction hash:

```json
{
  "tx_hash": "e63b28caa07adffb6e2453390a59509a1469e66698c75b4cfb2f0ae7a6887fdc"
}
```

The node outputs to the console the information about this transfer:

```none
Transfer between wallets: Wallet { pub_key: PublicKey(3E657AE),
                                   name: "Johnny Doe", balance: 90 }
                       => Wallet { pub_key: PublicKey(D1E87747),
                                   name: "Janie Roe", balance: 110 }
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
    "balance": "90",
    "name": "Johnny Doe",
    "pub_key": "03e657ae71e51be60a45b4bd20bcf79ff52f0c037ae6da0540a0e0066132b472"
  },
  {
    "balance": "110",
    "name": "Janie Roe",
    "pub_key": "d1e877472a4585d515b13f52ae7bfded1ccea511816d7772cb17e1ab20830819"
  }
]
```

#### Info on Specific Wallet

The second read endpoint also works:

```sh
curl "http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallet/\
03e657ae71e51be60a45b4bd20bcf79ff52f0c037ae6da0540a0e0066132b472"
```

The response is:

```json
{
  "balance": "90",
  "name": "Johnny Doe",
  "pub_key": "03e657ae71e51be60a45b4bd20bcf79ff52f0c037ae6da0540a0e0066132b472"
}
```

## Conclusion

Hurray! 🎉 You have created the first fully functional Exonum blockchain
with two wallets and transferred some money between them. Next,
[we are going to test it](test-service.md).

[explorer]: ../advanced/node-management.md#transaction
[tx-info]: ../architecture/transactions.md#info
[iron]: http://ironframework.io/
[bodyparser]: https://docs.rs/bodyparser/0.8.0/bodyparser/
[iron-handler]: https://docs.rs/iron/0.6.0/iron/middleware/trait.Handler.html
[rust-closure]: https://doc.rust-lang.org/book/first-edition/closures.html
[curry-fn]: https://en.wikipedia.org/wiki/Currying
[arc]: https://doc.rust-lang.org/std/sync/struct.Arc.html
[ref]: https://doc.rust-lang.org/std/cell/struct.Ref.html
[cargo-example]: http://doc.crates.io/manifest.html#examples
[lib.rs]: https://github.com/exonum/cryptocurrency/blob/master/src/lib.rs
[demo.rs]: https://github.com/exonum/cryptocurrency/blob/master/examples/demo.rs
[std-asref]: https://doc.rust-lang.org/std/convert/trait.AsRef.html
