# Cryptocurrency Tutorial: How to Create Services

In this demo we create and run single-node blockchain network that implements
a minimal cryptocurrency.

It will accept two types of transactions: create a wallet with a default balance,
transfer money between the wallets. Also we define a persistent storage to keep
the balance of wallets.

The full source code of this example you can download
[here](https://github.com/exonum/minibank).

## Create the single node

Exonum is written in Rust and you have to install the stable Rust
compiler to build this demo. If you haven't a necessary environment follow
[the installation guide](./install.md), please.

Let's create minimal crate with `exonum-core` dependency.

```sh
cargo new --bin minibank
```

Add to your `Cargo.toml` necessary dependencies:

```toml
[package]
name = "minibank"
version = "0.1.0"
authors = ["Your Name <your@email.com>"]

[dependencies]
iron = "0.5.1"
bodyparser = "0.7.0"
router = "0.5.1"
serde = "1.0"
serde_json = "1.0"
serde_derive = "1.0"

[dependencies.exonum]
git = "ssh://git@github.com/exonum/exonum-core.git"
rev = "cf87780b3de1ba161c490e0700870a0f2c308136"
```

We need to import crates with necessary types. Add to your `src/main.rs`:

```rust
extern crate serde;
extern crate serde_json;
#[macro_use] extern crate serde_derive;
#[macro_use] extern crate exonum;
extern crate router;
extern crate bodyparser;
extern crate iron;

use exonum::blockchain::{self, Blockchain, Service, GenesisConfig,
                         ValidatorKeys, Transaction, ApiContext};
use exonum::node::{Node, NodeConfig, NodeApiConfig, TransactionSend,
                   TxSender, NodeChannel};
use exonum::messages::{RawTransaction, FromRaw, Message};
use exonum::storage::{Fork, MemoryDB, MapIndex};
use exonum::crypto::{PublicKey, Hash};
use exonum::encoding::{self, Field};
use exonum::api::{Api, ApiError};
use iron::prelude::*;
use iron::Handler;
use router::Router;

```

Put constants to this file:

```rust
const SERVICE_ID: u16 = 1;

const TX_CREATE_WALLET_ID: u16 = 1;

const TX_TRANSFER_ID: u16 = 2;

const INIT_BALANCE: u64 = 100;
```

`SERVICE_ID` is an service identifier. `TX_CREATE_WALLET_ID` will be used as
identifier for wallet creating transaction. `TX_TRANSFER_ID` is an identifier
for funds transferring transaction. The latest `INIT_BALANCE` will be used as
started balance for every created wallet.

Declare `main` function:

```rust
fn main() {
    exonum::helpers::init_logger().unwrap();
}
```

In the code above we prepared a logger which will show us what Exonum node does.
You can try to run it with command:

```sh
cargo run
```

Exonum contains `Blockchain` type.
To create blockchain we should create a database instance and declare a list of
[provided services](../architecture/services.md). While we haven't implemented
a service we keep the list empty.

We use `MemoryDB` to store our data in this demo. `MemoryDB` is an in-memory
database implementation useful for development and testing purposes.
There is LevelDB support as well; it's recommended to use it for production
applications.
Put this code after logger initialization into `main` function body:

```rust
let db = MemoryDB::new();
let services: Vec<Box<Service>> = vec![ ];
let blockchain = Blockchain::new(Box::new(db), services);
```

Minimal blockchain is ready. In addition to defining blockchain object, we need
to create a node (with a keypair) and provide an API to interact with the
blockchain. Every node needs public and private keys. We'll create
a temporary pair, but for ordinary use you should use the keys from node
configuration file.

### Create keys

This code makes a pair of keys. They determine the uniqueness of the node.
We use `exonum::crypto::gen_keypair()` function take random pair of keys.
The node needs pair of keys for a consensus and pair for service needs.

```rust
let (consensus_public_key, consensus_secret_key) = exonum::crypto::gen_keypair();
let (service_public_key, service_secret_key) = exonum::crypto::gen_keypair();
```

### Configure node

Node expects a blockchain instance and a configuration.
[Node configuration](../architecture/configuration.md) consists of two
parts:

* Local configuration which includes
    * Node configuration (includes IP settings and other configuration parts)
    * Api configuration (includes settings of REST API)
* Global configuration or genesis configuration (includes all members
  to achieve a consensus)

Genesis configuration contains a list of public keys of
[validators](../glossary.md#validator): nodes which can vote for block
acceptance. Our demo blockchain network has only one validator. Fill this
list with your public keys:

```rust
let validator_keys = ValidatorKeys {
    consensus_key: consensus_public_key,
    service_key: service_public_key,
};
let genesis = GenesisConfig::new(vec![validator_keys].into_iter());
```

Let's configure REST API to open the node for external web requests.
For the REST API we should set an address of public API (there is a private API,
but it is used for administration purposes and we won't call it now). Also you
can activate blockchain explorer. It's a tool to get and explore all blocks of
the blockchain. Our node will expose API on **8000** port of every network
interface.

```rust
let api_address = "0.0.0.0:8000".parse().unwrap();
let api_cfg = NodeApiConfig {
    enable_blockchain_explorer: true,
    public_api_address: Some(api_address),
    private_api_address: None,
};
```

We also configure our node to listen for peer-to-peer connections on the
port 2000 for all network interfaces. This port is used for interactions among
full nodes in the Exonum network.

```rust
let peer_address = "0.0.0.0:2000".parse().unwrap();
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

let mut node = Node::new(blockchain, node_cfg);
node.run().unwrap();
```

## Declare persistent data

Blockchain is a database which keep the data in protected blocks.
We should declare what kind of data we want to store in a blockchain.

For our case we should declare a container to store the information about
wallets and its balance. Inside the wallet we want to store the public key
to validate requests from wallet's owner. Also we want to store a name of owner
for convenience reasons. And we need to keep the actual balance of the wallet.
We've got the following:

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

Macro `encoding_struct!` helps to declare a struct and determine bounds of
evere piece of data. We need to change wallet balance, so we add methods to
the `Wallet` type:

```rust
impl Wallet {
    pub fn increase(&mut self, amount: u64) {
        let balance = self.balance() + amount;
        Field::write(&balance, &mut self.raw, 40, 48);
    }

    pub fn decrease(&mut self, amount: u64) {
        let balance = self.balance() - amount;
        Field::write(&balance, &mut self.raw, 40, 48);
    }
}
```

We've added two methods: to increase the wallet's balance and other to decrease
it. We used `Field::write` method there, because the data stored as binary blob
and we have to overwrite data directly in the blob.

## Create the schema

Schema is a structured view of the key-value storage implemented by `MemoryDB`.
Actually, to access to the storage we have to use a mutable reference of `Fork`.
Fork of a database is a database snapshot with upcoming changes:

```rust
pub struct CurrencySchema<'a> {
    view: &'a mut Fork,
}
```

For access to the objects inside the storage we have to declare the layout of
the data. For example, if we want to keep the wallets in the storage we will
use an instance of `MapIndex`: key-value view to our data where key of index
is a public key of wallet, but value is a serialized `Wallet` struct.

Fork provides random access to every data inside the database.
To separate the data we should add a unique prefix to every group of data.
To store all wallets in a separate domain we will add the prefix in the
first argument to `MapIndex::new` call:

```rust
impl<'a> CurrencySchema<'a> {
    pub fn wallets(&mut self) -> MapIndex<&mut Fork, PublicKey, Wallet> {
        let prefix = blockchain::gen_prefix(SERVICE_ID, 0, &());
        MapIndex::new(prefix, self.view)
    }

    pub fn wallet(&mut self, pub_key: &PublicKey) -> Option<Wallet> {
        self.wallets().get(pub_key)
    }
}
```

## Transactions

[Transaction](../architecture/transactions.md) is a kind of message which
performs actions with a blockchain.

For our cryptocurrency demonstration we need two transaction types:

1. Create a new wallet and add some money to it
2. Transfer money between two different wallets

Declaration of any transaction needs to contain:

1. Service identifier
2. Unique (within the service) identifier of message
2. Size of fixed part of the message

You have to add service and message identifiers, because Exonum will use it
for deserialization purposes.

Transaction to create a new wallet have to contain public key of a wallet and
name of user who created this wallet:

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

Transaction to transfer money between different wallets:

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

The last consists of two public keys: for wallet of sender and the second key
of wallet of receiver. Also it contains amount of money to move between them.
We add `seed` field to make our transaction is
[impossible to replay](../architecture/transactions.md#non-replayability).

## Transaction execution

Every transaction in Exonum has an attached busiless-logic of the blockchain.
Actually we declared structs and we also have to implement `Trasaction` trait
which includes `verify` method to verify the internal integrity of the
transaction and `execute` method which contains logic which applied to the
storage when a transaction is executed.

For every transaction we will check the signature.
`execute` method gets the reference to a `Fork` of a storage. We can wrap it
with our schema to turn it into structured storage with our data layout inside.

In the following method we verify the signature of a transaction, check that
the wallet is not exists and add a new one if so:

```rust
impl Transaction for TxCreateWallet {
    fn verify(&self) -> bool {
        self.verify_signature(self.pub_key())
    }

    fn execute(&self, view: &mut Fork) {
        let mut schema = CurrencySchema { view };
        if schema.wallet(self.pub_key()).is_none() {
            let wallet = Wallet::new(self.pub_key(), self.name(), INIT_BALANCE);
            println!("Create the wallet: {:?}", wallet);
            schema.wallets().put(self.pub_key(), wallet)
        }
    }
}
```

This transaction also adds `100` to the balance of wallet.

`TxTransfer` transaction finds two wallets for both sides of a transfer
transaction. If they have been found it checks the balance of the sender and if
it has enough money then decreases the sender balance and increases the balance
of receiver.

We also have to check that sender is not the receiver, because the implementation
below will create money out of nowhere if the sender is equal to the receiver.

```rust
impl Transaction for TxTransfer {
    fn verify(&self) -> bool {
         (*self.from() != *self.to()) && self.verify_signature(self.from())
    }

    fn execute(&self, view: &mut Fork) {
        let mut schema = CurrencySchema { view };
        let sender = schema.wallet(self.from());
        let receiver = schema.wallet(self.to());
        if let (Some(mut sender), Some(mut receiver)) = (sender, receiver) {
            let amount = self.amount();
            if sender.balance() >= amount {
                sender.decrease(amount);
                receiver.increase(amount);
                println!("Transfer between wallets: {:?} => {:?}", sender, receiver);
                let mut wallets = schema.wallets();
                wallets.put(self.from(), sender);
                wallets.put(self.to(), receiver);
            }
        }
    }
}
```

## API implementation

Node's API is a struct which implements `Api` trait. We defined one which
contains a channel - a connection to the blockchain node instance.

```rust
#[derive(Clone)]
struct CryptocurrencyApi {
    channel: TxSender<NodeChannel>,
}
```

For requests need we've added `TransactionRequest` enumeration which joins all
types of our transactions. We also implemented `Into<Box<Transacstion>>`
to convert every deserialized `TransactionRequest` into the boxed
`Transaction` to send to the node's channel later.

For responses we will return the `Hash` of a transaction.

```rust
#[serde(untagged)]
#[derive(Clone, Serialize, Deserialize)]
enum TransactionRequest {
    CreateWallet(TxCreateWallet),
    Transfer(TxTransfer),
}

impl Into<Box<Transaction>> for TransactionRequest {
    fn into(self) -> Box<Transaction> {
        match self {
            TransactionRequest::CreateWallet(trans) => Box::new(trans),
            TransactionRequest::Transfer(trans) => Box::new(trans),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct TransactionResponse {
    tx_hash: Hash,
}
```

To join our handler with http handler of a web-server we implemented `wire`
method. This method takes the reference to a router. In the method below we add
one handler to convert any input `JSON` data to a `Transaction` instance.

The transactions endpoint responds with a hash of the transaction. It also
sends the transaction via the channel, so that it will be broadcast over the
blockchain network and included into a block.

We bind the transaction handler to `/v1/wallets/transaction` route.

```rust
impl Api for CryptocurrencyApi {
    fn wire(&self, router: &mut Router) {

        let self_ = self.clone();
        let transaction = move |req: &mut Request| -> IronResult<Response> {
            match req.get::<bodyparser::Struct<TransactionRequest>>() {
                Ok(Some(transaction)) => {
                    let transaction: Box<Transaction> = transaction.into();
                    let tx_hash = transaction.hash();
                    self_.channel.send(transaction).map_err(|e| ApiError::Events(e))?;
                    let json = TransactionResponse { tx_hash };
                    self_.ok_response(&serde_json::to_value(&json).unwrap())
                }
                Ok(None) => Err(ApiError::IncorrectRequest("Empty request body".into()))?,
                Err(e) => Err(ApiError::IncorrectRequest(Box::new(e)))?,
            }
        };
        let route_post = "/v1/wallets/transaction";
        router.post(&route_post, transaction, "transaction");
    }
}
```

## Define minimal service

Service is a group of templated transactions (we've defined them before). It
has a name and a unique id to determine the service inside a blockchain.

```rust
struct CurrencyService;
```

We created `CurrencyService` struct and to turn it into a blockchain service
we should implement `Service` trait to it. You can read more in the
[Interface with Exonum Framework](../architecture/services.md#interface-with-exonum-framework)
section.

Two first methods are simple: `service_name` returns the name of our service,
`service_id` return the unique id of our service (`SERVICE_ID` constant used).

The method `tx_from_raw` is used to convert into a transaction any data which
coming to the node. To choose the right deserializer we can use `message_type()`
to get the unique identifier of message we declared before. If transaction
built sucessfully we put it into the `Box<_>`.

The last method `public_api_handler` have to make REST `Handler` to handle
web requests to the REST API. We can put any handler for eny request and we will
implement the capability to add transaction with the REST API. As our API needs
to send transactions to the node we add `node_channel` to our
`CryptocurrencyApi` instance.

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
        };
        api.wire(&mut router);
        Some(Box::new(router))
    }
}
```

`CryptocurrencyApi` type implements `Api` trait of Exonum and we can use
`Api::wire` method to connect this `Api` instance to the `Router`.

## Run

We've implemented all pieces of minimal blockchain. Add `CryptocyrrencyService`
to services list of the blockchain and run the demo:

```rust
let services: Vec<Box<Service>> = vec![
    Box::new(CurrencyService),
];
```

To compile and run the final code enter:

```sh
cargo run
```

It builds the code and start a compiled binary.

Let's send transactions to our demo.

Create `create-wallet-1.json` file and put the content:

```js
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
curl -H "Content-Type: application/json" -X POST -d @create-wallet-1.json http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets/transaction
```

This transactions creates first wallet and return hash of the transaction:

```js
{
  "tx_hash": "44c6c2c58eaab71f8d627d75ca72f244289bc84586a7fb42186a676b2ec4626b"
}
```

Node will show that first wallet created:

```none
Create the wallet: Wallet { pub_key: PublicKey(3E657AE),
                            name: "Johnny Doe", balance: 100 }
```

To create the second wallet put the code into `create-wallet-2.json` file:

```js
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
curl -H "Content-Type: application/json" -X POST -d @create-wallet-2.json http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets/transaction
```

It returns the hash of the second transaction:

```js
{
  "tx_hash": "8714e90607afc05f43b82c475c883a484eecf2193df97b243b0d8630812863fd"
}
```

Node prints the second wallet created successfully:

```none
Create the wallet: Wallet { pub_key: PublicKey(D1E87747),
                            name: "Janie Roe", balance: 100 }
```

Now we have 2 wallets in the database and we can transfer money between them.
Create `transfer-funds.json` and add to the file:

```js
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

This transaction transfer 10 units from the first wallet to the second.
To send it to the node enter:

```sh
curl -H "Content-Type: application/json" -X POST -d @transfer-funds.json http://127.0.0.1:8000/api/services/cryptocurrency/v1/wallets/transaction
```

The last transaction returns the hash:

```js
{
  "tx_hash": "e63b28caa07adffb6e2453390a59509a1469e66698c75b4cfb2f0ae7a6887fdc"
}
```

Node prints to the console an information about this transfer:

```none
Transfer between wallets: Wallet { pub_key: PublicKey(3E657AE),
                                   name: "Johnny Doe", balance: 90 }
                       => Wallet { pub_key: PublicKey(D1E87747),
                                   name: "Janie Roe", balance: 110 }
```

You've created the first blockchain with 2 wallets and transfered some money
between them.
