# Cryptocurrency Tutorial: Intro

This section explains how to create a safe transactional system to transfer
money. It implements a minimal cryptocurrency.

In this demo we create and run single-node blockchain network. That network
will accept three types of transactions: create a wallet, issue money for
a wallet, transfer money between the wallets. Also we define a persistent
storage to keep the balance of wallets.

## Create the single node

Exonum is written in Rust and you have to install the stable Rust
compiler to build this demo. If you haven't one, install it from
[official Rust website](https://www.rust-lang.org).

Let's create minimal crate with `exonum-core` dependency.

```sh
cargo new --bin cryptocurrency
```

Add to your `Cargo.toml` `exonum-core` dependency.

```toml
[package]
name = "cryptocurrency"
version = "0.1.0"
authors = ["Your Name <your@email.com>"]

[dependencies]
exonum = { git = "ssh://git@github.com/exonum/exonum-core.git" }
```

Add to your `src/main.rs`:

```rust
extern crate exonum;

fn main() {
    exonum::helpers::init_logger().unwrap();
}
```

In the code above we prepared a logger which will show us what Exonum Node does.

Exonum contais `Blockchain` type.
To create blockchain we should create a database instance and declare a list of
provided services. While we haven't implemented a service we keep the list
empty.

We use `MemoryDB` to store our data in this demo, because `MemoryDB` is an
in-memory database implementation useful for development and testing purposes.
But there is `LevelDB` support as well as we recommend to use it in production.

```rust
let db = MemoryDB::new();
let services: Vec<Box<Service>> = vec![ ];
let blockchain = Blockchain::new(db, services);
```

Minimal blockchain is ready. To work with our blocks we have to create a node
which maintains a database, writes new blocks and provides REST API to interact
with the blockchain. Every node needs public and private keys. We'll create
a temporary pair, but for ordinary use you should use the keys from node
configuration file.

If you want to generate new keypair, you can call `exonum::crypto::gen_keypair()`
method to take random pair of keys.

Node expects a blockchain instance and a configuration.
[Node configuration](../../architecture/configuration.md) consists of two
parts:

* Local configuration which includes
    * Node configuration (includes IP settings and other configuration parts)
    * Api configuration (includes sessings of REST API)
* Global configuration or genesis configuration (includes all members
  to achieve a consensus)

This code makes a pair of keys. They determine the uniqueness of the node.
Every node has own unique pair of keys.

```rust
let (public_key, secret_key) = exonum::crypto::gen_keypair();
```

Genesis configuration contains a list of public keys of validators: nodes which
can vote for block acceptance. Fill it with your public key value:

```rust
let genesis = GenesisConfig::new(vec![public_key].into_iter());
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

The next configuration collects all settings we defined earlier.
Also we bind our node to port **2000**.
Peer port used by nodes to interact each other.

```rust
let peer_address = "0.0.0.0:2000".parse().unwrap();
let node_cfg = NodeConfig {
    listen_address: peer_address,
    peers: vec![],
    public_key,
    secret_key,
    genesis,
    network: Default::default(),
    whitelist: Default::default(),
    api: api_cfg,
};

let mut node = Node::new(blockchain, node_cfg);
node.run().unwrap();
```

> TODO Add curl to check the explorer

## Declare persistent data

Blockchain is a middleware to keep operations in protected blocks and execute
it to restore the data. We should declare what kind of data we want to store
and update.

For our case we should declare a container to store the information about
a wallet and its balance. Inside the wallet we want to store the public key
to validate requests from wallet's owner. Also we want to store a name of owner
for convenience reasons. And we have to keep the actual balance of the wallet.
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
evere piece of data. If you want to manipulate the data you can add some methods
to the type:

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

Schema of data is a capability to access to the data in the persistent storage.
Actually, to access to the storage we have to use a mutable reference of `Fork`.
Fork of a database is a database snapshot with upcoming changes:

```rust
pub struct CurrencySchema<'a> {
    view: &'a mut Fork,
}
```

For access to the objects inside the storage we have to declare the layout of
the data. For example, if we want to keep the wallets in the storage we will
use an instance of `MapIndex`. Exonum has two types of indices to interact
with the data: `ListIndex` and `MapIndex`. The list-based index is a layout to
store a sequence of the data. And map is a layout to handle key-value pairs.
Because our wallets have a unique public key we will use `MapIndex` to
store them: key of index is a public key of walet, but value is a serialized
`Wallet` struct. Fork provides random access to every data inside the database.
To separate the data logically we should add a unique prefix to every group
of data. To store all wallets in a separate logically domain we add the prefix
in the first argument to `MapIndex::new` call:

```rust
impl<'a> CurrencySchema<'a> {
    pub fn wallets(&mut self) -> MapIndex<&mut Fork, PublicKey, Wallet> {
        let prefix = gen_prefix(SERVICE_ID, 1, &());
        MapIndex::new(prefix, self.view)
    }

    pub fn wallet(&mut self, pub_key: &PublicKey) -> Option<Wallet> {
        self.wallets().get(pub_key)
    }
}
```

Exonum indices are handy data mapping which you can use like collections from
standard library of Rust. If we found and get the value we also can replace it
with a new one.

## Transactions

Transaction is a kind of message which performs actions with a blockchain.

For our cryptocurrency demonstration we need three transaction types:

1. Create a new wallet
2. Add some money to the wallet
3. Transfer money between two different wallets

Declaration of any transaction have to contain:

1. Type of transaction (a service identifier)
2. Unique identifier of message
2. Size of fixed size of the message

You have to add service and message identifiers, because Exonum will use it
for deserialization purposes. Also it helps to maintain future versioning if
messages are changed.

Transaction to create a new wallet have to contain public key of a wallet and
name of user who created this wallet:

```rust
pub const TX_WALLET_ID: u16 = 1;

message! {
    struct TxCreateWallet {
        const TYPE = SERVICE_ID;
        const ID = TX_WALLET_ID;
        const SIZE = 40;

        field pub_key:     &PublicKey  [00 => 32]
        field name:        &str        [32 => 40]
    }
}

```

Message is used for insreasing the balance of the wallet has to contain public
key of the wallet and amount of money to add:

> You can add money to the wallet, because we made this to simplify the example.
In real-world app you shouldn't do that.

The field `seed` contains random number to make every transaction unique.
You can read more in the [Transaction artice](../../architecture/transactions.md).

```rust
pub const TX_ISSUE_ID: u16 = 2;

message! {
    struct TxIssue {
        const TYPE = SERVICE_ID;
        const ID = TX_ISSUE_ID;
        const SIZE = 48;

        field pub_key:     &PublicKey  [00 => 32]
        field amount:      u64         [32 => 40]
        field seed:        u64         [40 => 48]
    }
}
```

Transaction to transfer money between different wallets:

```rust
pub const TX_TRANSFER_ID: u16 = 3;

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
of wallet of receiver. And of course it contains amount of money to move
between them.

## Contracts

Every transaction in Exonum has an attached contract. The contract is a
busiless-logic of the blockchain. Actually we declared structs and we also have
to implement `Trasaction` trait which includes `verify` method to verify every
incoming transaction and `execute` method which contains contract logic which
applied to the storage when a transaction is executed.

For every transaction we will check the signature. For money transfer
transaction we also will check that sender is not the receiver to prevent
useless transactions flood.

`execute` method gets the reference to a `Fork` of a storage. We can wrap it
with our schema to turn it into structured storage with our data layout inside.

`TxCreateWallet` checks the wallet is not exists and add a new one if so:

```rust
impl Transaction for TxCreateWallet {
    fn verify(&self) -> bool {
        self.verify_signature(self.pub_key())
    }

    fn execute(&self, view: &mut Fork) {
        let mut schema = CurrencySchema { view };
        if let None = schema.wallet(self.pub_key()) {
            let wallet = Wallet::new(self.pub_key(), self.name(), 0);
            schema.wallets().put(self.pub_key(), wallet)
        }
    }
}
```

`TxIssue` transaction finds the wallet, adds `amount` of money and puts the
changed wallet back into the storage. Storage will be updated when block
applied:

```rust
impl Transaction for TxIssue {
    fn verify(&self) -> bool {
        self.verify_signature(self.pub_key())
    }

    fn execute(&self, view: &mut Fork) {
        let mut schema = CurrencySchema { view };
        if let Some(mut wallet) = schema.wallet(self.pub_key()) {
            wallet.increase(self.amount());
            schema.wallets().put(self.pub_key(), wallet)
        }
    }
}
```

`TxTransfer` transaction finds two wallets for both sides of a transfer
transaction. If they have been found it checks the balance of the sender and if
it has enough money then decreases the sender balance and increases the balance
of receiver.

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
                let mut wallets = schema.wallets();
                wallets.put(self.from(), sender);
                wallets.put(self.to(), receiver);
            }
        }
    }
}
```

## Define minimal service

Service is a group of acceptable transactions (we've defined them before). It
has a name and a unique id to determine the service inside a blockchain.

```rust
pub const SERVICE_ID: u16 = 1;

struct CurrencyService;
```

We created `CurrencyService` struct and to turn it into a blockchain service
we should implement `Service` trait to it.

Two first methods are simple: `service_name` returns the name of our service,
`service_is` return the unique id of our service (`SERVICE_ID` constant used).

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
            TX_ISSUE_ID => Box::new(TxIssue::from_raw(raw)?),
            TX_WALLET_ID => Box::new(TxCreateWallet::from_raw(raw)?),
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
`Api::wire` method to connect this API instance to the `Router`.

## Api implementation

Node's API is a struct which implements `Api` trait. We defined one which
contains a channel - a connection to the blockchain node instance.

```rust
#[derive(Clone)]
struct CryptocurrencyApi<T> {
    channel: T,
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
    Issue(TxIssue),
    Transfer(TxTransfer),
}

impl Into<Box<Transaction>> for TransactionRequest {
    fn into(self) -> Box<Transaction> {
        match self {
            TransactionRequest::CreateWallet(trans) => Box::new(trans),
            TransactionRequest::Issue(trans) => Box::new(trans),
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

Transaction gives the hash which will be send to the client. Also every
transaction sends to the channel of the blockchain node.

We bind the transaction handler to `/v1/wallets/transaction` route.

```rust
impl<T: TransactionSend + Clone + 'static> Api for CryptocurrencyApi<T> {
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

## Run

We've implemented all pieces of minimal blockchain. Add `CryptocyrrencyService`
to services list of the blockchain and run the demo:

```rust
let services: Vec<Box<Service>> = vec![
    Box::new(CurrencyService),
];
```
