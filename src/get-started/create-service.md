# Cryptocurrency Tutorial: How to Create Services

In this demo we create a single-node blockchain network that implements
a minimalistic cryptocurrency. The network accepts two types of transactions:
creates a wallet with a default balance and transfers money between wallets.

You can view and download the full source code of this demo
[here](https://github.com/exonum/cryptocurrency).

## Create Node

Exonum is written in Rust and you have to install the stable Rust
compiler to build this demo. If you do not have the environment set up, follow
[the installation guide](./install.md).

Let’s create minimal crate with `exonum` dependency.

```sh
cargo new --bin cryptocurrency
```

Add necessary dependencies to your `Cargo.toml`:

```toml
[package]
name = "cryptocurrency"
version = "0.3.0" # corresponds to version of Exonum
authors = ["Your Name <your@email.com>"]

[dependencies]
exonum = "0.3.0"
iron = "0.5.1"
bodyparser = "0.7.0"
router = "0.5.1"
serde = "1.0"
serde_json = "1.0"
serde_derive = "1.0"
```

We need to import crates with necessary types. Edit your `src/main.rs`:

```rust
extern crate serde;
extern crate serde_json;
#[macro_use] extern crate serde_derive;
#[macro_use] extern crate exonum;
extern crate router;
extern crate bodyparser;
extern crate iron;

use exonum::blockchain::{Blockchain, Service, GenesisConfig,
                         ValidatorKeys, Transaction, ApiContext};
use exonum::node::{Node, NodeConfig, NodeApiConfig, TransactionSend,
                   ApiSender};
use exonum::messages::{RawTransaction, FromRaw, Message};
use exonum::storage::{Fork, MemoryDB, MapIndex};
use exonum::crypto::{PublicKey, Hash, HexValue};
use exonum::encoding;
use exonum::api::{Api, ApiError};
use iron::prelude::*;
use iron::Handler;
use router::Router;
```

Define constants:

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

Declare `main` function:

```rust
fn main() {
    exonum::helpers::init_logger().unwrap();
}
```

In the code above we have set up a logger that will output information on Exonum
node activity into the console.

You can try to run the blockchain at this point with

```sh
cargo run
```

### Initialize Blockchain

Exonum contains `Blockchain` type.
To create a blockchain we should create a database instance and declare a list
of [provided services](../architecture/services.md). As we have not implemented
a service yet, we keep the list empty.

Put this code after logger initialization into `main` function body:

```rust
let db = MemoryDB::new();
let services: Vec<Box<Service>> = vec![ ];
let blockchain = Blockchain::new(Box::new(db), services);
```

We use `MemoryDB` to store our data in the code above. `MemoryDB` is an
in-memory database implementation useful for development and testing purposes.
There is RocksDB support as well that is recommendable for
production applications.

A minimal blockchain is ready, but it is pretty much useless, because there is
no way to interact with it. To fix this we need to create a node and provide an
API to interact with the blockchain.

### Create Keys

Every node needs public and private keys. Keys are unique to every node
and are used to identify it within the network. We will create temporary keys
using `exonum::crypto::gen_keypair()` function, but for ordinary use you should
load the keys from the node configuration file. The node needs two pairs of
keys, actually: one for interaction with other nodes while reaching consensus
and another one for service needs.

```rust
let (consensus_public_key, consensus_secret_key) =
    exonum::crypto::gen_keypair();
let (service_public_key, service_secret_key) =
    exonum::crypto::gen_keypair();
```

### Configure Node

For launching a node a blockchain instance and node configuration are required.
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
Fill this list with the public keys we have just generated:

```rust
let validator_keys = ValidatorKeys {
    consensus_key: consensus_public_key,
    service_key: service_public_key,
};
let genesis = GenesisConfig::new(vec![validator_keys].into_iter());
```

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

// Complete node configuration
let node_cfg = NodeConfig {
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
};

let node = Node::new(blockchain, node_cfg);
node.run().unwrap();
```

## Declare Persistent Data

We should declare what kind of data we want to store in the blockchain.

For our case we need to declare a type to store the information about
the wallet and its balance. Inside the wallet we want to store the public key
to validate requests from the owner of the wallet. We want to store the name of
the owner for convenience reasons. Also, we need to keep the current balance of
the wallet. Summing it all up, `Wallet` datatype will look like:

```rust
encoding_struct! {
    struct Wallet {
        const SIZE = 48;

        field pub_key:            &PublicKey  [00 => 32]
        field name:               &str        [32 => 40]
        field balance:            u64         [40 => 48]
    }
}
```

Macro `encoding_struct!` helps declare a
[serializable](../architecture/serialization.md)
struct and determine bounds of its fields. We need to change wallet balance,
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

Schema is a structured view of the key-value storage implemented by `MemoryDB`.
To access the storage, however, we will not use `MemoryDB` directly, but
rather a `Fork`. `Fork` is a mutable snapshot of the database, where the changes
can be easily rolled back; that is why it is used when dealing with transactions
and blocks in the blockchain.

```rust
pub struct CurrencySchema<'a> {
    view: &'a mut Fork,
}
```

For access to the objects inside the storage we need to declare the layout of
the data. As we want to keep the wallets in the storage, we will
use an instance of [`MapIndex`](../architecture/storage.md#mapindex),
a map abstraction.
Keys of the index will correspond to public keys of the wallets.
Index values will be serialized `Wallet` structs.

`Fork` provides random access to every piece of data inside the database.
To isolate the wallets map into a separate entity,
we add a unique prefix to it,
which is the first argument to the `MapIndex::new` call:

```rust
impl<'a> CurrencySchema<'a> {
    pub fn wallets(&mut self) -> MapIndex<&mut Fork, PublicKey, Wallet> {
        MapIndex::new("cryptocurrency.wallets", self.view)
    }

    // Utility method to quickly get a separate wallet from the storage
    pub fn wallet(&mut self, pub_key: &PublicKey) -> Option<Wallet> {
        self.wallets().get(pub_key)
    }
}
```

## Define Transactions

[Transaction](../architecture/transactions.md) is a kind of message which
performs atomic actions on the blockchain state.

For our cryptocurrency demonstration we need two transaction types:

- Create a new wallet and add some money to it
- Transfer money between two different wallets

Declaration of any transaction should contain:

- Service identifier
- Unique (within the service) message identifier
- Size of the fixed part of the message

Exonum will use these constants for (de)serialization of the messages.

### Creating New Wallet

A Transaction to create a new wallet should contain the public key of the wallet
and the name of the user who created this wallet:

```rust
message! {
    struct TxCreateWallet {
        const TYPE = SERVICE_ID;
        const ID = TX_CREATE_WALLET_ID;
        const SIZE = 40;

        field pub_key:     &PublicKey  [00 => 32]
        field name:        &str        [32 => 40]
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
        const SIZE = 80;

        field from:        &PublicKey  [00 => 32]
        field to:          &PublicKey  [32 => 64]
        field amount:      u64         [64 => 72]
        field seed:        u64         [72 => 80]
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

In our case `verify` for both transaction types will check the transaction
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
        let mut schema = CurrencySchema { view };
        if schema.wallet(self.pub_key()).is_none() {
            let wallet = Wallet::new(self.pub_key(),
                                     self.name(),
                                     INIT_BALANCE);
            println!("Create the wallet: {:?}", wallet);
            schema.wallets().put(self.pub_key(), wallet)
        }
    }
}
```

This transaction also sets the wallet balance to 100.

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
                let mut wallets = schema.wallets();
                wallets.put(self.from(), sender);
                wallets.put(self.to(), receiver);
            }
        }
    }
}
```

In order for transactions to be properly displayed [in the blockchain explorer][explorer],
we also should redefine the [`info()` method][tx-info]. The implementation is the
same for both transactions and looks like this:

```rust
impl Transaction for TxCreateWallet {
    // `verify()` and `execute()` code...

    fn info(&self) -> serde_json::Value {
        serde_json::to_value(&self)
            .expect("Cannot serialize transaction to JSON")
    }
}
```

## Implement API

Finally, we need to implement the node API with the help of [Iron framework][iron].
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
#[derive(Serialize, Deserialize)]
struct TransactionResponse {
    tx_hash: Hash,
}

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
                let json = TransactionResponse { tx_hash };
                self.ok_response(&serde_json::to_value(&json).unwrap())
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
            let mut view = self.blockchain.fork();
            let mut schema = CurrencySchema { view: &mut view };
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
        let mut view = self.blockchain.fork();
        let mut schema = CurrencySchema { view: &mut view };
        let idx = schema.wallets();
        let wallets: Vec<Wallet> = idx.values().collect();
        self.ok_response(&serde_json::to_value(&wallets).unwrap())
    }
}
```

As with the transaction endpoint, the methods have an idiomatic signature
`fn(&self, &mut Request) -> IronResult<Response>`.

!!! warning
    An attentive reader may notice that we use the `fork()` method to get
    information from the blockchain storage.
    `Fork`s provide *read-write* access, not exactly what
    you want to use for *read-only* access to the storage in production
    (instead, you may want to use `Snapshot`s).
    We use `Fork`s only to keep the tutorial reasonably short. If we used
    `Snapshot`s,
    we would have to make `CurrencySchema` generic and implement it both for
    `Fork` (which would be used in transactions) and `Snapshot` (which would
    be used in read requests).

### Wire API

Finally, we need to tie request processing logic to
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
For this to work, observe that cloning a `Blockchain` does not create
a new blockchain from scratch,
but rather produces a reference to the same blockchain instance.
(That is, `Blockchain` is essentially a smart pointer type similar to [`Arc`][arc]
or [`Ref`][ref].)

## Define Service

Service is a group of templated transactions (we have defined them before). It
has a name and a unique id to determine the service inside the blockchain.

```rust
struct CurrencyService;
```

To turn `CurrencyService` into a blockchain service,
we should implement the `Service` trait to it.

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

## Run Service

We have implemented all the pieces of a minimalistic blockchain. Now,
add `CryptocyrrencyService` to services list of the blockchain and run the demo:

```rust
let services: Vec<Box<Service>> = vec![
    Box::new(CurrencyService),
];
```

To compile and run the final code enter:

```sh
cargo run
```

This will build the code and start the compiled binary.

### Send Transactions via REST API

Let’s send some transactions to our demo.

#### Create the First Wallet

Create `create-wallet-1.json` file and put there:

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

Use `curl` command to send this transaction to the node by HTTP:

```sh
curl -H "Content-Type: application/json" -X POST -d @create-wallet-1.json \
    http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets/transaction
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
    http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets/transaction
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
Create `transfer-funds.json` and add to the file:

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
    http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets/transaction
```

This request returns the transaction hash:

```json
{
  "tx_hash": "e63b28caa07adffb6e2453390a59509a1469e66698c75b4cfb2f0ae7a6887fdc"
}
```

The node outputs to the console information about this transfer:

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
with two wallets and transferred some money between them.

[explorer]: ../advanced/node-management.md#transaction
[tx-info]: ../architecture/transactions.md#info
[iron]: http://ironframework.io/
[bodyparser]: https://docs.rs/bodyparser/0.8.0/bodyparser/
[iron-handler]: https://docs.rs/iron/0.6.0/iron/middleware/trait.Handler.html
[rust-closure]: https://doc.rust-lang.org/book/first-edition/closures.html
[curry-fn]: https://en.wikipedia.org/wiki/Currying
[arc]: https://doc.rust-lang.org/std/sync/struct.Arc.html
[ref]: https://doc.rust-lang.org/std/cell/struct.Ref.html
