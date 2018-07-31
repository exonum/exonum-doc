# Cryptocurrency Advanced Tutorial

This tutorial is an extended version of the
[simple Cryptocurrency Tutorial](https://exonum.com/doc/get-started/create-service/).
We suggest that you try to launch the simple service first before proceeding
with the advanced tutorial as some very
basic steps may be omitted here for the sake of smooth exposition.

In this Exonum service we implement a cryptocurrency with a blockchain network
of 4 validator nodes. For didactic
reasons all 4 nodes will be launched on one machine locally. However, a real
network of 4 nodes may be set up performing
the same steps on separate machines.

The service allows the following operations:
 - creating a wallet
 - replenishing the wallet balance
 - transferring money between wallets
 - obtaining [cryptographic proofs](https://exonum.com/doc/architecture/storage/#merkelized-indices)
   of executed transactions
 - reviewing wallets history.

You can view and download the full source code of this tutorial
[here](https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced).

Besides, unlike its predecessor, the tutorial contains a
[client part]( https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced/frontend)
which provides for simple interaction with the service.

## Create Rust Project

To build the service you must have [Node.js](https://nodejs.org/en/download/)
and the latest version of
[Rust](https://rustup.rs/) compiler installed on your PC.

Create a crate with the **exonum** crate as a dependency.

```
cargo new cryptocurrency-advanced
```

Add necessary dependencies to `Cargo.toml` in the project directory:

```
[dependencies]
exonum = "0.9.0"
exonum-configuration = "0.9.0"
serde = "1.0"
serde_derive = "1.0"
failure = "=0.1.1"
```

Then import said dependencies into `src/lib.rs` file. We will use them to fetch
the necessary structures, functions, types, traits etc.:

```rust
#[macro_use]
extern crate exonum;
#[macro_use]
extern crate failure;
extern crate serde;
#[macro_use]
extern crate serde_derive;
```

For convenience reasons we decided to divide the code into 4 submodules, each
corresponding to a certain part of the
service business logic. Let’s announce them below:

```rust
pub mod api;
pub mod schema;
pub mod transactions;
pub mod wallet;
```

## Constants

Let’s define the constants to be used further:

```rust
/// Unique service ID.
const CRYPTOCURRENCY_SERVICE_ID: u16 = 128;
/// Name of the service.
pub const SERVICE_NAME: &str = "cryptocurrency";
/// Initial balance of the wallet.
const INITIAL_BALANCE: u64 = 100;
```

Implement a service structure and realize a trait for it with all the necessary
methods and credentials:

```rust
/// Exonum `Service` implementation.
#[derive(Default, Debug)]
pub struct CurrencyService;

impl Service for CurrencyService {
    // Indicate service name
    fn service_name(&self) -> &str {
        SERVICE_NAME
    }

    // Indicate service ID.
    fn service_id(&self) -> u16 {
        CRYPTOCURRENCY_SERVICE_ID
    }

    // Indicate the way the state hash of the database is calculated.
    fn state_hash(&self, view: &dyn Snapshot) -> Vec<Hash> {
        let schema = CurrencySchema::new(view);
        schema.state_hash()
    }

    // Interface to create transactions from raw data.
    fn tx_from_raw(&self, raw: RawTransaction) -> Result<Box<dyn Transaction>, EncodingError> {
        WalletTransactions::tx_from_raw(raw).map(Into::into)
    }

    // Indicate public API.
    fn wire_api(&self, builder: &mut ServiceApiBuilder) {
        api::CryptocurrencyApi::wire(builder);
    }
}
```

Unlike in previous tutorial where node configuration was realized manually, in
the advanced tutorial we implement a
trait that allows us to launch the project with the help of `NodeBuilder`.
`NodeBuilder` is an abstract that allows to
easily configure a node for launching. In our case it is responsible for simple
set up of the network with the
Cryptocurrency Advanced Service on top of it.

```rust
#[derive(Debug)]
pub struct ServiceFactory;

impl fabric::ServiceFactory for ServiceFactory {
    fn service_name(&self) -> &str {
        SERVICE_NAME
    }

    fn make_service(&mut self, _: &Context) -> Box<dyn Service> {
        Box::new(CurrencyService)
    }
}
```

## Declare Persistent Data

Similarly to a simple cryptocurrency demo we need to declare the data that we
will store in our blockchain, i.e. the `wallet` type:

```rust
use exonum::crypto::{Hash, PublicKey};
encoding_struct! {
    /// Wallet information stored in the database.
    struct Wallet {
        pub_key:            &PublicKey,
        name:               &str,
        balance:            u64,
        history_len:        u64,
        history_hash:       &Hash,
    }
}
```

As you can see, apart from the already known fields (public key, owner’s name,
balance), the new wallet type stores
the **length of the wallet history** and its **hash**. These data are required
to link the wallet history to other
histories/data. In this way maps and other indices required for cryptographic
proofs will be built.

We also realize an auxiliary method for the `Wallet` structure. The method
simultaneously updates the balance and the history of the wallet:

```rust
impl Wallet {
    /// Returns a copy of this wallet with the updated balance.
    pub fn set_balance(self, balance: u64, history_hash: &Hash) -> Self {
        Self::new(
            self.pub_key(),
            self.name(),
            balance,
            self.history_len() + 1,
            history_hash,
        )
    }
}
```

This method is *immutable*; it consumes the old instance of the wallet and
produces a new instance with the
modified `balance` field. It is called within mutable methods allowing
manipulations with the Wallet that will be
specified below.

## Create Schema

As we already mentioned in the simple cryptocurrency tutorial Schema is a
structured view of the [key-value storage](https://exonum.com/doc/architecture/storage/)
used in Exonum. We will use the same `Snapshot` and `Fork` abstractions - for
read requests and transactions
correspondingly - to interact with the schema in this tutorial as well.

Declare schema as a generic wrapper to make it operable with both types of
storage views:

```rust
use exonum::{
    crypto::{Hash, PublicKey}, storage::{Fork, ProofListIndex, ProofMapIndex, Snapshot},
};

use wallet::Wallet;
use INITIAL_BALANCE;

/// Database schema for cryptocurrency.
#[derive(Debug)]
pub struct CurrencySchema<T> {
    view: T,
}

impl<T> AsMut<T> for CurrencySchema<T> {
    fn as_mut(&mut self) -> &mut T {
        &mut self.view
    }
}
```

Note that in this demo we will generate cryptographic proofs of availability of
certain data in our blockchain,
so `ProofMapIndex` and `ProofListIndex` will be used as map abstractions instead
of  `MapIndex` and `ListIndex`:

```rust
impl<T> CurrencySchema<T>
where
    T: AsRef<dyn Snapshot>,
{
    /// Constructs schema from the database view.
    pub fn new(view: T) -> Self {
        CurrencySchema { view }
    }

    /// Returns `MerklePatriciaTable` with wallets.
    pub fn wallets(&self) -> ProofMapIndex<&T, PublicKey, Wallet> {
        ProofMapIndex::new("cryptocurrency.wallets", &self.view)
    }

    /// Returns history of the wallet with the given public key.
    pub fn wallet_history(&self, public_key: &PublicKey) -> ProofListIndex<&T, Hash> {
        ProofListIndex::new_in_family("cryptocurrency.wallet_history", public_key, &self.view)
    }

    /// Returns wallet for the given public key.
    pub fn wallet(&self, pub_key: &PublicKey) -> Option<Wallet> {
        self.wallets().get(pub_key)
    }

    /// Returns state hash of service database.
    pub fn state_hash(&self) -> Vec<Hash> {
        vec![self.wallets().merkle_root()]
    }
}
```

As you could notice, in this demo we have added two new getter methods
associated with the history of the wallets
stored in the blockchain and the state hash of the service required for building
cryptographic proofs.

The mutable methods allow to write to the index the changes caused by
manipulations with the wallet structures. The
obvious set of manipulations includes creating a wallet and changing its balance
while keeping track of all
corresponding transactions in its history. There is also an auxiliary method
that maintains an index of the changing
wallets:

```rust
/// Implementation of mutable methods.
impl<'a> CurrencySchema<&'a mut Fork> {
    /// Returns mutable `MerklePatriciaTable` with wallets.
    pub fn wallets_mut(&mut self) -> ProofMapIndex<&mut Fork, PublicKey, Wallet> {
        ProofMapIndex::new("cryptocurrency.wallets", &mut self.view)
    }

    /// Returns history for the wallet by the given public key.
    pub fn wallet_history_mut(
        &mut self,
        public_key: &PublicKey,
    ) -> ProofListIndex<&mut Fork, Hash> {
        ProofListIndex::new_in_family("cryptocurrency.wallet_history", public_key, &mut self.view)
    }

    /// Increases balance of the wallet and appends new record to its history.
    ///
    /// Panics if there is no wallet with the given public key.
    pub fn increase_wallet_balance(&mut self, wallet: Wallet, amount: u64, transaction: &Hash) {
        let wallet = {
            let mut history = self.wallet_history_mut(wallet.pub_key());
            history.push(*transaction);
            let history_hash = history.merkle_root();
            let balance = wallet.balance();
            wallet.set_balance(balance + amount, &history_hash)
        };
        self.wallets_mut().put(wallet.pub_key(), wallet.clone());
    }

    /// Decreases balance of the wallet and appends new record to its history.
    ///
    /// Panics if there is no wallet with given public key.
    pub fn decrease_wallet_balance(&mut self, wallet: Wallet, amount: u64, transaction: &Hash) {
        let wallet = {
            let mut history = self.wallet_history_mut(wallet.pub_key());
            history.push(*transaction);
            let history_hash = history.merkle_root();
            let balance = wallet.balance();
            wallet.set_balance(balance - amount, &history_hash)
        };
        self.wallets_mut().put(wallet.pub_key(), wallet.clone());
    }

    /// Creates new wallet and appends first record to its history.
    pub fn create_wallet(&mut self, key: &PublicKey, name: &str, transaction: &Hash) {
        let wallet = {
            let mut history = self.wallet_history_mut(key);
            history.push(*transaction);
            let history_hash = history.merkle_root();
            Wallet::new(key, name, INITIAL_BALANCE, history.len(), &history_hash)
        };
        self.wallets_mut().put(key, wallet);
    }
}
```

## Reporting Errors

Before defining the types of transactions, the service will realize, we define
the types of errors that might occur
during execution thereof. The section is identical to the
[one]( https://exonum.com/doc/get-started/create-service/#reporting-errors) in
the simple Cryptocurrency demo.

You might have noticed that for this purpose we use an external crate `failure`
that was mentioned in the dependencies
above. The errors list covers typical cases a user might encounter during
service application that are quite self-explanatory:

```rust
/// Error codes emitted by wallet transactions during execution.
#[derive(Debug, Fail)]
#[repr(u8)]
pub enum Error {
    /// Wallet already exists.
    ///
    /// Can be emitted by `CreateWallet`.
    #[fail(display = "Wallet already exists")]
    WalletAlreadyExists = 0,

    /// Sender doesn't exist.
    ///
    /// Can be emitted by `Transfer`.
    #[fail(display = "Sender doesn't exist")]
    SenderNotFound = 1,

    /// Receiver doesn't exist.
    ///
    /// Can be emitted by `Transfer` or `Issue`.
    #[fail(display = "Receiver doesn't exist")]
    ReceiverNotFound = 2,

    /// Insufficient currency amount.
    ///
    /// Can be emitted by `Transfer`.
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

The implementation code above returns a JSON that provides a corresponding error
code together with its verbal description.

## Define Transactions

We use transactions! macro to define the service transactions.

In this tutorial, however, we unite the transactions under the
`WalletTransations` group as they all refer to the same
structure. Although this is the only transactions group in our demo, the idea
might be of use in cases where a larger
number of different groups of transactions is applied.

This time we need three types of transactions, i.e. apart from the old two ones
(“create a new wallet” and “transfer
money between wallets” whose descriptions are
[available]( https://exonum.com/doc/get-started/create-service/#define-transactions)
in the old tutorial) we add a new
one that is responsible for reimbursement of the wallet balance:

```rust
transactions! {
    pub WalletTransactions {
        const SERVICE_ID = CRYPTOCURRENCY_SERVICE_ID;

        /// Transfers `amount` of the currency from one wallet to another.
        struct Transfer {
            from:    &PublicKey,
            to:      &PublicKey,
            amount:  u64,
            seed:    u64,
        }

        /// Issues `amount` of the currency to the `wallet`.
        struct Issue {
            pub_key:  &PublicKey,
            amount:  u64,
            seed:    u64,
        }

        /// Creates wallet with the given `name`.
        struct CreateWallet {
            pub_key: &PublicKey,
            name:    &str,
        }
    }
}
```

The `issue` transaction type contains the public key of the wallet it reimburses
and applies a `seed` to avoid replay of the transaction.

## Transaction Execution

The principle of transaction execution remains the
[same](https://exonum.com/doc/get-started/create-service/#transaction-execution)
as in the previous tutorial. Namely,
we realize `Transaction` trait with the transaction business logic described
therein for all our transaction types.

The check points for `CreateWallet` and `Transfer` transactions are similar to
their predecessors.

Specifically, we check that the wallet does not exist before creating one:

```rust
impl Transaction for CreateWallet {
    fn verify(&self) -> bool {
        self.verify_signature(self.pub_key())
    }

    fn execute(&self, fork: &mut Fork) -> ExecutionResult {
        let mut schema = CurrencySchema::new(fork);
        let pub_key = self.pub_key();
        let hash = self.hash();

        if schema.wallet(pub_key).is_none() {
            let name = self.name();
            schema.create_wallet(pub_key, name, &hash);
            Ok(())
        } else {
            Err(Error::WalletAlreadyExists)?
        }
    }
}
```

For `Transfer` we check the sender’s signature to be sure he is a real owner of
the wallet and does not steal money
from a third person. In this tutorial we use `increase_wallet_balance` and
`decrease_wallet_balance` methods to charge
and award money to wallets, so sending money to yourself will not change the
wallet balance. However, we still need to
check that the sender’s balance is larger than the sent amount to complete the
transfer:

```rust
impl Transaction for Transfer {
    fn verify(&self) -> bool {
        (self.from() != self.to()) && self.verify_signature(self.from())
    }

    fn execute(&self, fork: &mut Fork) -> ExecutionResult {
        let mut schema = CurrencySchema::new(fork);

        let from = self.from();
        let to = self.to();
        let hash = self.hash();
        let amount = self.amount();

        let sender = schema.wallet(from).ok_or(Error::SenderNotFound)?;

        let receiver = schema.wallet(to).ok_or(Error::ReceiverNotFound)?;

        if sender.balance() < amount {
            Err(Error::InsufficientCurrencyAmount)?
        }

        schema.decrease_wallet_balance(sender, amount, &hash);
        schema.increase_wallet_balance(receiver, amount, &hash);

        Ok(())
    }
}
```

The last transaction type is responsible for replenishment of the wallet
balance. Again, we check the signature of the
wallet to be sure we reimburse our own account. We use `increase_wallet_balance`
method to put money to the wallet and
record a new wallet instance into our database:

```rust
impl Transaction for Issue {
    fn verify(&self) -> bool {
        self.verify_signature(self.pub_key())
    }

    fn execute(&self, fork: &mut Fork) -> ExecutionResult {
        let mut schema = CurrencySchema::new(fork);
        let pub_key = self.pub_key();
        let hash = self.hash();

        if let Some(wallet) = schema.wallet(pub_key) {
            let amount = self.amount();
            schema.increase_wallet_balance(wallet, amount, &hash);
            Ok(())
        } else {
            Err(Error::ReceiverNotFound)?
        }
    }
}
```

## Implement API

Next, we need to implement the node API. The API will allow us not only to send
and
obtain the data stored in the blockchain but also will provide proofs of the
correctness of the returned data:

```rust
use exonum::{
    api::{self, ServiceApiBuilder, ServiceApiState},
    blockchain::{self, BlockProof, Transaction, TransactionSet}, crypto::{Hash, PublicKey},
    helpers::Height, node::TransactionSend, storage::{ListProof, MapProof},
};

use transactions::WalletTransactions;
use wallet::Wallet;
use {CurrencySchema, CRYPTOCURRENCY_SERVICE_ID};

/// Public service API description.
#[derive(Debug, Clone, Copy)]
pub struct CryptocurrencyApi;
```

First, we list the structures used by API. We need to define `WalletQuery`
structure which describes what information we
need to pass to the node to get response with information about specific wallet:

```rust
/// The structure describes the query parameters for the `get_wallet` endpoint.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct WalletQuery {
    /// Public key of the queried wallet.
    pub pub_key: PublicKey,
}
```

Besides this we also declare a number of specific structures. Said
structures will be used for generating responses to users’ requests:

```rust
/// The structure returned by the REST API.
#[derive(Debug, Serialize, Deserialize)]
pub struct TransactionResponse {
    /// Hash of the transaction.
    pub tx_hash: Hash,
}

/// Proof of existence for specific wallet.
#[derive(Debug, Serialize, Deserialize)]
pub struct WalletProof {
    /// Proof to the whole database table.
    pub to_table: MapProof<Hash, Hash>,
    /// Proof to the specific wallet in this table.
    pub to_wallet: MapProof<PublicKey, Wallet>,
}

/// Wallet history.
#[derive(Debug, Serialize, Deserialize)]
pub struct WalletHistory {
    pub proof: ListProof<Hash>,
    pub transactions: Vec<WalletTransactions>,
}
```

The following structure is based on the two previous auxiliary structures. It is
this structure, that a user receives as
a response to his request. The structure contains the necessary information on
the wallet together with the corresponding
proofs of existence thereof and the correctness of its history.

```rust
/// Wallet information.
#[derive(Debug, Serialize, Deserialize)]
pub struct WalletInfo {
    pub block_proof: BlockProof,
    pub wallet_proof: WalletProof,
    pub wallet_history: Option<WalletHistory>,
}
```

Now let’s define the method that will allow us to obtain information on a
particular wallet together with cryptographic
proof of its existence. The proofs also allow to get confirmation of existence
of a particular transaction in the wallet history.

First, we claim `API` structure to which the mentioned method refers. We create
two schemas – one general schema of our
blockchain and the other one is the schema of our service described in the
relevant section above:

```rust
impl CryptocurrencyApi {
    pub fn wallet_info(state: &ServiceApiState, query: WalletQuery) -> api::Result<WalletInfo> {
        let snapshot = state.snapshot();
        let general_schema = blockchain::Schema::new(&snapshot);
        let currency_schema = CurrencySchema::new(&snapshot);
```

Secondly, we get the current height of our blockchain and obtain all the blocks
and their precommits to start building the proof:

```rust
let max_height = general_schema.block_hashes_by_height().len() - 1;

let block_proof = general_schema
    .block_and_precommits(Height(max_height))
    .unwrap();
```

We then obtain the first part of the proof - from the state hash of our service
to the `Wallets` table:

```rust
let to_table: MapProof<Hash, Hash> =
    general_schema.get_proof_to_service_table(CRYPTOCURRENCY_SERVICE_ID, 0);
```

Note that we indicate `0` as the value of the upper boarder of the interval.
This value is the first (and only) element
in the array of the `state_hash` method described in the Schema section. It
corresponds to the root hash of the `Wallets` table.

Next, we fetch a proof of existence of a particular wallet inside the `Wallets`
table and include both parts of the proof into the `WalletProof` structure:

```rust
let to_wallet: MapProof<PublicKey, Wallet> = currency_schema.wallets().get_proof(query.pub_key);

let wallet_proof = WalletProof {
    to_table,
    to_wallet,
};
```

As a final step of this action we extract the proof for the wallet history.
Note, that in this demo the proof confirms availability of a certain data
hash inside the database and not the data itself. Meanwhile, the data stored in
the database, is returned together with
the proof for user’s reference. This allows user to check correctness of the
provided proof.

We obtain the wallet history and the proof from the first element to the last
one:

```rust
let wallet = currency_schema.wallet(&query.pub_key);

        let wallet_history = wallet.map(|_| {
            let history = currency_schema.wallet_history(&query.pub_key);
            let proof = history.get_range_proof(0, history.len());
```

Next, we obtain transaction data for each history hash, transform them into the
readable format and output them in the form of an array:

```rust
        let transactions: Vec<WalletTransactions> = history
            .iter()
            .map(|record| general_schema.transactions().get(&record).unwrap())
            .map(|raw| WalletTransactions::tx_from_raw(raw).unwrap())
            .collect::<Vec<_>>();

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
}
```

We now have a complete proof for availability of a block in the blockchain, of a
certain wallet in the database and
said wallet’s history aggregated under the `WalletInfo` structure.

The `post_transaction` defines the transactions processing logic, i.e. we
convert a transaction into our internal
Exonum-readable format and forward it into the network. The user in his turn
receives back a hash of this transaction.

```rust
pub fn post_transaction(
        state: &ServiceApiState,
        query: WalletTransactions,
    ) -> api::Result<TransactionResponse> {
        let transaction: Box<dyn Transaction> = query.into();
        let tx_hash = transaction.hash();
        state.sender().send(transaction)?;
        Ok(TransactionResponse { tx_hash })
}
```

Finally, we `wire` function and call the above-mentioned methods with it:

```rust
pub fn wire(builder: &mut ServiceApiBuilder) {
    builder
        .public_scope()
        .endpoint("v1/wallets/info", Self::wallet_info)
        .endpoint_mut("v1/wallets/transaction", Self::post_transaction);
}
```

## Interaction with the Service

We have now described all the structural parts of our demo. The last step is to
introduce the `main` function that will
launch our service. It does this in the following manner:
- imports our demo library described in `lib.rs` file together with
  configuration service and `exonum` crate; and
- creates nodes with two services – configuration service and our
  cryptocurrency_advanced service:

```rust
extern crate exonum;
extern crate exonum_configuration;
extern crate exonum_cryptocurrency_advanced;

use exonum::helpers::{self, fabric::NodeBuilder};
use exonum_configuration as configuration;
use exonum_cryptocurrency_advanced as cryptocurrency;

fn main() {
    exonum::crypto::init();
    helpers::init_logger().unwrap();

    let node = NodeBuilder::new()
        .with_service(Box::new(configuration::ServiceFactory))
        .with_service(Box::new(cryptocurrency::ServiceFactory));
    node.run();
}
```

As soon as you launch the demo with the `cargo run` command, the `NodeBuilder`
will start to configure the network,
i.e. generate nodes, create their public and private keys, exchange keys between
nodes, etc. To learn how the network
is configured, please, consult our service
[Read Me](https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced).

Note, that for the commands to work you need to use the name of your service
instead of “exonum-cryptocurrency-advaced”
indicated in the Read Me or just use `cargo run` command instead of your crate
name.

## Conclusion

Good job! You managed to set up, describe and launch an extended version of a
fully functional Exonum service!
