# Create Timestamping Service

In this tutorial we will create a simple timestamping service for an Exonum
powered blockchain and start up a four-node network that
will process requests to this service. The service accepts a single transaction
type: adding timestamps to the blockchain. It also allows you to check that a
timestamp with a certain hash has been included into the blockchain.

The current tutorial includes both backend and frontend. For convenience, this
tutorial is also subdivided into sections on frontend and backend. The
implemented service relies on the Exonum time oracle to determine the time
indicated in the timestamps.

You can view and download the full source code of this tutorial at
our [GitHub repository][timestamping].

Prior to setting up this demo, make sure you have the necessary packages
installed:
- [git](https://git-scm.com/downloads)
- [Rust](https://rustup.rs)
- [Node.js & npm](https://nodejs.org/en/download/)

Refer to [Cryptocurrecy][Cryptocurrecy] and
[Cryptocurrecy Advanced][Cryptocurrecy Advanced] for our other tutorials.

## Configure Backend

### Set up Rust Project

The very first step of developing a service, is creating a crate and adding
the necessary dependencies.

```
cargo new timestamping
```

Add necessary dependencies to ```Cargo.toml``` in the project directory:

```toml
[package]
name = "exonum-timestamping"
version = "0.0.0"
publish = false
authors = ["Your name <your@email.com>"]

[dependencies]
exonum = { version = "0.9.0", path = "../../../exonum" }
exonum-configuration = { version = "0.9.0", path = "../../../services/configuration" }
exonum-time = { version = "0.9.0", path = "../../../services/time" }
serde = "1.0.10"
serde_derive = "1.0.10"
serde_json = "1.0.2"
failure = "0.1.2"
log = "=0.4.3"
chrono = { version = "=0.4.5", features = ["serde"] }
```

Additionally, you can also add the following dependencies to ```Cargo.toml```
for future testing purposes:

```toml
[dev-dependencies]
exonum-testkit = { version = "0.9.0", path = "../../../testkit" }
pretty_assertions = "=0.5.1"
```

The default entry point for Rust crates is [src/lib.rs][src/lib.rs]. This is
where we indicate the external libraries required for our service.

```rust
extern crate chrono;
#[macro_use]
extern crate exonum;
extern crate exonum_time;
#[macro_use]
extern crate failure;
#[macro_use]
extern crate log;
extern crate serde;
#[macro_use]
extern crate serde_derive;
extern crate serde_json;

pub mod api;
pub mod schema;
pub mod transactions;

use exonum::{
    api::ServiceApiBuilder, blockchain::{self, Transaction, TransactionSet}, crypto::Hash,
    encoding::Error as StreamStructError, helpers::fabric, messages::RawTransaction,
    storage::Snapshot,
};

use api::PublicApi;
use schema::Schema;
use transactions::TimeTransactions;
```

As we have logically subdivided the service code related to the
backend into several modules, besides the imports, we have also indicated these
modules in [src/lib.rs][src/lib.rs]:

```
pub mod api;
pub mod schema;
pub mod transactions;
```

Next, let's declare the constants which will be used in the service. These
include the ID of our timestamping service and its name. Note that the ID and
name of the service should be unique and not coincide with those of any other
services you may be running.

```rust
const TIMESTAMPING_SERVICE: u16 = 130;
pub const SERVICE_NAME: &str = "timestamping";
```

## Configure Schema

We have separated the code that
configures the schema for this service into a separate file - [src/schema.rs][src/schema.rs].

The schema describes the main elements with which our service will operate.

First, using the `encoding_struct!` macro we define the two structures that the service can save in the Exonum blockchain.

```rust
encoding_struct! {
    /// Stores content's hash and some metadata about it.
    struct Timestamp {
        /// Hash of the content.
        content_hash: &Hash,

        /// Additional metadata.
        metadata: &str,
    }
}
```

The timestamp structure includes the hash of the timestamp and some additional metadata which can be added to the timestamp if required.

```rust
encoding_struct! {
    /// Timestamp entry.
    struct TimestampEntry {
        /// Timestamp data.
        timestamp: Timestamp,

        /// Hash of transaction.
        tx_hash: &Hash,

        /// Timestamp time.
        time: DateTime<Utc>,
    }
}
```

The timestamp entry includes the timestamp itself, the hash of the timestamping transaction and the time when the timestamp was recorded. The time value is provided by the time oracle.

Next we need to define the storage schema for our service:

```rust
#[derive(Debug)]
pub struct Schema<T> {
    view: T,
}
```
We need to implement (Debug) here to later be able to efficiently process error during the debugging process.

For our new schema, we next implement a method for passing a snapshot to the timestamping service.

```rust
impl<T> Schema<T> {
    /// Creates a new schema from the database view.
    pub fn new(snapshot: T) -> Self {
        Schema { view: snapshot }
    }
}
```

Using that snapshot, we implement the following two methods:

```rust
impl<T> Schema<T>
where
    T: AsRef<dyn Snapshot>,
{
    /// Returns the `ProofMapIndex` of timestamps.
    pub fn timestamps(&self) -> ProofMapIndex<&T, Hash, TimestampEntry> {
        ProofMapIndex::new("timestamping.timestamps", &self.view)
    }

    /// Returns the state hash of the timestamping service.
    pub fn state_hash(&self) -> Vec<Hash> {
        vec![self.timestamps().merkle_root()]
    }
}
```
 The `timestamps` method returns the list of all existing timestamps using the `ProofMapIndex` method of Exonum core.

 The `state_hash` method takes the hashes of all existing timestamps and calculates the resulting hash of the blockchain state.

Finally we need to declare the methods which will allow us to add new timestamps to the blockchain as they appear:

```rust
impl<'a> Schema<&'a mut Fork> {
    /// Returns the mutable `ProofMapIndex` of timestamps.
    pub fn timestamps_mut(&mut self) -> ProofMapIndex<&mut Fork, Hash, TimestampEntry> {
        ProofMapIndex::new("timestamping.timestamps", &mut self.view)
    }

    /// Adds the timestamp entry to the database.
    pub fn add_timestamp(&mut self, timestamp_entry: TimestampEntry) {
        let timestamp = timestamp_entry.timestamp();
        let content_hash = timestamp.content_hash();

        // Check that timestamp with given content_hash does not exist.
        if self.timestamps().contains(content_hash) {
            return;
        }

        // Add timestamp
        self.timestamps_mut().put(content_hash, timestamp_entry);
    }
}
```

First, we declare the `timestamps_mut` method which returns a mutable Fork of the blockchain.
Then, we declare the `add_timestamp` method which adds a new timestamp which will contain the timestamp entry we have defined previously and the hash of the timestamp.
The structure above also check if a timestamp with the given hash already exists in the blockchain. If the check is succesful the service adds the timestamp to the blockchain.

## Configure Transactions

We have separated the code that
configures transactions for this service into a separate file - [src/transactions.rs][src/transactions.rs].

First we define the structures we require from Exonum core and the time oracle.
Here we also indicate a connection to the schema we have configured previously in [src/schema.rs][src/schema.rs] and the `TIMESTAMPING_SERVICE` declared in [src/lib.rs][src/lib.rs].

```rust
use exonum::{
    blockchain::{ExecutionError, ExecutionResult, Transaction}, crypto::{CryptoHash, PublicKey},
    messages::Message, storage::Fork,
};
use exonum_time::schema::TimeSchema;

use schema::{Schema, Timestamp, TimestampEntry};
use TIMESTAMPING_SERVICE;
```

We define the error which might occur when processing transactions to our service. The currecnt timestamping service includes only one error, which occurs when
```rust
#[derive(Debug, Fail)]
#[repr(u8)]
pub enum Error {
    /// Content hash already exists.
    #[fail(display = "Content hash already exists")]
    HashAlreadyExists = 0,
}
```
Here we automatically implements the `Debug` and `Fail` traits for the `Error` enum using the `#[derive(Debug, Fail)] command`.
The `#[fail(display = "Content hash already exists")]` command will cause a panic and display the indicated message in case the error occurs.
The `#[repr(u8)]` command defines that the `Error` enum will be represented as a u8 variable in memory.

Next we describe how to transform the `Error` enum into `ExecutionError`.
--------------------WHY DO WE NEED THIS?

```rust
impl From<Error> for ExecutionError {
    fn from(value: Error) -> ExecutionError {
        let description = value.to_string();
        ExecutionError::with_description(value as u8, description)
    }
}
```

The `ExecutionError` will have the same description that we have indicated for the `Error` enum.

We describe the transaction that our timestamping service is to process using the `transactions!` macro.

```rust
transactions! {
    pub TimeTransactions {
        const SERVICE_ID = TIMESTAMPING_SERVICE;

        /// A timestamp transaction.
        struct TxTimestamp {
            /// Public key of transaction.
            pub_key: &PublicKey,

            /// Timestamp content.
            content: Timestamp,
        }
    }
}
```
We take the time from the time oracle. The transaction contains the public key of the node, which is used for transaction encryption and the timestamp. The timestamp represents the current time received from the time oracle.

As the final step of configuring the transactions, we need to implement the `Transaction` trait for our timestamping transaction. The `Transaction` trait needs to be implemnted for all transactions which are to be used in Exonum.

```rust
impl Transaction for TxTimestamp {
    fn verify(&self) -> bool {
        self.verify_signature(self.pub_key())
    }

    fn execute(&self, fork: &mut Fork) -> ExecutionResult {
        let time = TimeSchema::new(&fork)
            .time()
            .get()
            .expect("Can't get the time");

        let content = self.content();
        let hash = content.content_hash();

        let mut schema = Schema::new(fork);
        if let Some(_entry) = schema.timestamps().get(hash) {
            Err(Error::HashAlreadyExists)?;
        }

        trace!("Timestamp added: {:?}", self);
        let entry = TimestampEntry::new(self.content(), &self.hash(), time);
        schema.add_timestamp(entry);
        Ok(())
    }
}
```

First, the code above verifies the validity of the timestamping transaction using the public key, and then executes the transaction. The transaction performs the following operations:
1. Gets the current time value provided by the time oracle. If the system cannot get the time value, it will output a corresponding error.
2. Takes the content of the transaction and calculates its hash.
3. Checks if a transaction with the same hash does not already exist in the blockchain. If such a transaction with such a hash is located in the blockchain, the system will output a corresponding error.
4. Creates a new entry which includes the content of the transaction, its hash and the current time value.


### Configure API endpoints



### Define Service

Service is a group of templated transactions (we have defined them before).
It has a name and a unique ID to determine the service inside the blockchain. We
define our new service in [src/lib.rs][src/lib.rs]:

```rust
#[derive(Debug, Default)]
pub struct Service;

impl Service {
    pub fn new() -> Self {
        Service
    }
}
```
To turn `Service` into a blockchain service, we need to implement the Exonum
`Service` trait for it.

!!!tip
   Read more on how to turn a type into a blockchain service in the
   [Interface with Exonum Framework](../architecture/services.md#interface-with-exonum-framework)
   section.

```rust
impl blockchain::Service for Service {
    fn service_id(&self) -> u16 {
        TIMESTAMPING_SERVICE
    }

    fn service_name(&self) -> &'static str {
        SERVICE_NAME
    }

    fn state_hash(&self, view: &dyn Snapshot) -> Vec<Hash> {
        let schema = Schema::new(view);
        schema.state_hash()
    }

    fn tx_from_raw(&self, raw: RawTransaction) -> Result<Box<dyn Transaction>, StreamStructError> {
        let tx = TimeTransactions::tx_from_raw(raw)?;
        Ok(tx.into())
    }

    fn wire_api(&self, builder: &mut ServiceApiBuilder) {
        PublicApi::wire(builder);
    }
}
```
The code above declares a number of methods:
- `service_id` - returns the ID of the service
- `service_name` - returns the name of the service
- `state_hash` - calculates the hash of
  [the blockchain state](../glossary.md#blockchain-state). The method
  should return [a vector of hashes](../architecture/services.md#state-hash)
  of the [Merkelized service tables](../glossary.md#merkelized-indices).
- `tx_from_raw` - deserializes transactions processed by the service.
   If the incoming transaction is built successfully, we put it into a `Box<_>`.
- `wire_api` - connects the API endpoints of the service to the API of the
  blockchain.

### Create Service Instance

We define the `ServiceFactory` structure in [src/lib.rs][src/lib.rs]. This
structure builds an instance of our service.

```rust
#[derive(Debug, Clone, Copy)]
pub struct ServiceFactory;
```
The `ServiceFactory` structure compiles an instance of our service from the
code we have written.

```rust
impl fabric::ServiceFactory for ServiceFactory {
    fn service_name(&self) -> &str {
        SERVICE_NAME
    }

    fn make_service(&mut self, _: &fabric::Context) -> Box<dyn blockchain::Service> {
        Box::new(Service::new())
    }
}
```
The `ServiceFactory` returns the name of the service and includes the `make_service`
 which will later allow us to include our new service into the `NodeBuilder`.

[timestamping]: https://github.com/exonum/exonum/tree/master/examples/timestamping
[Cryptocurrecy Advanced]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced
[Cryptocurrecy]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency
[src/lib.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/lib.rs
[src/transactions.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/transactions.rs
[src/schema.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/schema.rs
[src/api.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/api.rs
[src/main.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/main.rs
