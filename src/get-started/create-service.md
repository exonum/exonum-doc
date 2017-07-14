# Cryptocurrency Tutorial: How to Create Services

In this demo we create a single-node blockchain network that implements
a minimalistic cryptocurrency.
The networks accepts two types of transactions: create a wallet with a default balance,
and transfer money between wallets.

You can view and download the full source code of this demo
[here](https://github.com/exonum/minibank).

## Create Node

Exonum is written in Rust and you have to install the stable Rust
compiler to build this demo. If you don’t have the environment set up, follow
[the installation guide](./install.md).

Let’s create minimal crate with `exonum` dependency.

```sh
cargo new --bin minibank
```

Add necessary dependencies to your `Cargo.toml`:

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
git = "ssh://git@github.com/exonum/exonum.git"
rev = "cf87780b3de1ba161c490e0700870a0f2c308136"
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

Define constants:

```rust
// Service identifier
const SERVICE_ID: u16 = 1;
// Identifier for wallet creating transaction
const TX_CREATE_WALLET_ID: u16 = 1;
// Identifier for coins transferring transaction
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

In the code above we prepared a logger that will output what Exonum node does
to the console.

You can try to run the blockchain at this point with

```sh
cargo run
```

### Initialize Blockchain

Exonum contains `Blockchain` type.
To create blockchain we should create a database instance and declare a list of
[provided services](../architecture/services.md). As we haven’t implemented
a service yet, we keep the list empty.

Put this code after logger initialization into `main` function body:

```rust
let db = MemoryDB::new();
let services: Vec<Box<Service>> = vec![ ];
let blockchain = Blockchain::new(Box::new(db), services);
```

We use `MemoryDB` to store our data in the code above. `MemoryDB` is an in-memory
database implementation useful for development and testing purposes.
There is LevelDB support as well; it’s recommended to use it for production
applications.

Minimal blockchain is ready, but it’s pretty much useless, because there is
no way to interact with it. To fix this, we need
to create a node and provide an API to interact with the
blockchain.

### Create Keys

Every node needs public and private keys. Keys are unique to every node
and are used to identify it within the network.
We’ll create temporary keys using `exonum::crypto::gen_keypair()` function,
but for ordinary use you should use the keys from the node configuration file.
The node needs 2 pairs of keys, actually: one for consensus and another
for service needs.

```rust
let (consensus_public_key, consensus_secret_key) =
    exonum::crypto::gen_keypair();
let (service_public_key, service_secret_key) =
    exonum::crypto::gen_keypair();
```

### Configure Node

Node expects a blockchain instance and a configuration.
[Node configuration](../architecture/configuration.md) consists of two
parts:

- Local configuration which includes:

    - Node configuration (e.g., IP settings and other configuration parts)
    - API configuration (e.g., settings of REST API)

- Global configuration or genesis configuration (all parameters
  that need to be the same for all nodes in the network)

The genesis configuration contains a list of public keys of
[validators](../glossary.md#validator), i.e., nodes that can vote for block
acceptance. Our demo blockchain network has only one validator (our node).
Fill this list with the public keys we’ve just generated:

```rust
let validator_keys = ValidatorKeys {
    consensus_key: consensus_public_key,
    service_key: service_public_key,
};
let genesis = GenesisConfig::new(vec![validator_keys].into_iter());
```

Let’s configure REST API to open the node for external web requests.
We should set an address of public API (there is a private API,
but it is used for administration purposes and we won’t call it now).
We also activate the blockchain explorer, a tool to get and explore
blocks and transactions on the blockchain.
Our node will expose API on port 8000 of every network interface.

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

let mut node = Node::new(blockchain, node_cfg);
node.run().unwrap();
```

## Declare Persistent Data

We should declare what kind of data we want to store in a blockchain.

For our case, we need to declare a container to store the information about
wallets and its balance. Inside the wallet we want to store the public key
to validate requests from wallet’s owner. We want to store a name of owner
for convenience reasons. Also, we need to keep the current balance of the wallet.
Summing all it up, `Wallet` type will look like:

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

Macro `encoding_struct!` helps declare a [serializable](../architecture/serialization.md)
struct and determine bounds of
its fields. We need to change wallet balances, so we add methods to
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

We’ve added two methods: to increase the wallet’s balance, and another one to decrease
it. We used `Field::write`, because the data in structs processed by `encoding_struct`
is stored as a binary blob
and we need to overwrite it in-place.

## Create Schema

Schema is a structured view of the key-value storage implemented by `MemoryDB`.
To access to the storage, however, we won’t use `MemoryDB` directly, but
rather a `Fork`. `Fork` is a mutable snapshot of the database, the changes
in which can be easily rolled back; that’s why it’s used when dealing with transactions
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
Keys of the index will correspond to public keys of wallets,
and its values will be serialized `Wallet` structs.

`Fork` provides random access to every piece of data inside the database.
To isolate the wallets map into a separate entity,
we add a unique prefix to it,
which is the first argument to `MapIndex::new` call:

```rust
impl<'a> CurrencySchema<'a> {
    pub fn wallets(&mut self) -> MapIndex<&mut Fork, PublicKey, Wallet> {
        let prefix = blockchain::gen_prefix(SERVICE_ID, 0, &());
        MapIndex::new(prefix, self.view)
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

Declaration of any transaction needs to contain:

- Service identifier
- Unique (within the service) identifier of message
- Size of the fixed part of the message

Exonum will use these constants for (de)serialization of the messages.

### Creating New Wallet

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
receiver’s one (`to`). It also contains the amount of money to move between them.
We add the `seed` field to make sure that our transaction is
[impossible to replay](../architecture/transactions.md#non-replayability).

### Transaction Execution

Every transaction in Exonum has an attached business-logic of the blockchain,
which is encapulated in the `Transaction` trait.
This trait includes the `verify` method to verify the integrity of the
transaction, and the `execute` method which contains logic which applied to the
storage when a transaction is executed.

In our case, `verify` for both transaction types will check the transaction signature.
`execute` method gets the reference to a `Fork` of a storage, so we wrap it
with our `CurrencySchema` to access our data layout.

For the wallet creation, we check that
the wallet doesn’t exist and add a new wallet if so:

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

`TxTransfer` transaction gets two wallets for both sides of a transfer
transaction. If they have been found, we checks the balance of the sender. If
the sender has enough coins, then we decrease the sender’s balance
and increases the receiver’s balance.

We also need to check that the sender does not send the coins to himself.
Otherwise, the implementation
below will create money out of thin air if the sender is equal to the receiver.

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
        if let (Some(mut sender), Some(mut receiver)) = (sender, receiver) {
            let amount = self.amount();
            if sender.balance() >= amount {
                sender.decrease(amount);
                receiver.increase(amount);
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

## Implement API

Finally, we need to implement the node API.
To do this, we declare a struct which implements the `Api` trait.
A struct will
contains a channel, i.e., a connection to the blockchain node instance.

```rust
#[derive(Clone)]
struct CryptocurrencyApi {
    channel: TxSender<NodeChannel>,
}
```

To simplify request processing, we add a `TransactionRequest` enum
which joins both types of our transactions.
We also implement the `Into<Box<Transaction>>` trait for this enum
to make sure deserialized `TransactionRequest`s fit into the node’s channel.

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

To join our handler with the HTTP handler of a web-server, we need to implement
the `wire` method. This method takes the reference to a router.
In the method below we add
one handler to convert input JSON into a `Transaction`.
The handler responds with a hash of the transaction. It also
sends the transaction to the channel, so that it will be broadcast over the
blockchain network and included into a block.

```rust
impl Api for CryptocurrencyApi {
    fn wire(&self, router: &mut Router) {
        let self_ = self.clone();
        let tx_handler = move |req: &mut Request| -> IronResult<Response> {
            match req.get::<bodyparser::Struct<TransactionRequest>>() {
                Ok(Some(tx)) => {
                    let tx: Box<Transaction> = tx.into();
                    let tx_hash = tx.hash();
                    self_.channel.send(tx)
                                 .map_err(|e| ApiError::Events(e))?;
                    let json = TransactionResponse { tx_hash };
                    self_.ok_response(&serde_json::to_value(&json).unwrap())
                }
                Ok(None) => Err(ApiError::IncorrectRequest(
                    "Empty request body".into()))?,
                Err(e) => Err(ApiError::IncorrectRequest(Box::new(e)))?,
            }
        };

        // Bind the transaction handler to a specific route.
        let route_post = "/v1/wallets/transaction";
        router.post(&route_post, tx_handler, "transaction");
    }
}
```

## Define Service

Service is a group of templated transactions (we’ve defined them before). It
has a name and a unique id to determine the service inside a blockchain.

```rust
struct CurrencyService;
```

To turn `CurrencyService` into a blockchain service,
we should implement the `Service` trait to it.

!!! tip
    You can read more in the [Interface with Exonum Framework](../architecture/services.md#interface-with-exonum-framework)
    section.

Two methods of the `Service` trait are simple:

- `service_name` returns the name of our service
- `service_id` returns the unique id of our service
   (i.e., the `SERVICE_ID` constant)

The `tx_from_raw` method is used to deserialize transactions
coming to the node. To choose the right deserializer, we can use `message_type()`
to get the unique identifier of message we declared before. If the incoming
transaction is built successfully, we put it into a `Box<_>`.

The remaining method, `public_api_handler`, creates a REST `Handler` to process
web requests to the node. We will use it to
receive transactions via REST API using the logic we defined in `CryptocurrencyApi`
earlier.

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

## Run Service

We’ve implemented all pieces of a minimalistic blockchain. Now,
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

This will build the code and start a compiled binary.

### Send Transactions via REST API

Let’s send some transactions to our demo.

#### Create First Wallet

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

#### Second Wallet

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

Now we have 2 wallets in the database and we can transfer money between them.
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

This requests returns the transaction hash:

```json
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

Hurray! 🎉 You’ve created the first fully functional Exonum blockchain
with 2 wallets and transferred some money between them.
