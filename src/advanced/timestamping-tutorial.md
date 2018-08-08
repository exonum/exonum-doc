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
