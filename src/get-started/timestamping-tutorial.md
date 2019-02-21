# Timestamping Service Tutorial

In this tutorial we will create a Timestamping Service for an Exonum
powered blockchain and start up a four-node network that will process requests
to this service. The service accepts a single transaction type: submitting
hashes of files to the blockchain. It also allows checking whether a file
with a certain hash has been submitted to the blockchain already.

The implemented service relies on the Exonum Time Oracle to determine the
current blockchain time value.

You can view and download the full source code of this tutorial at
our [GitHub repository][timestamping].

Prior to setting up this demo, make sure you have the necessary packages
installed:

- [git](https://git-scm.com/downloads)
- [Rust](https://rustup.rs)
- [Node.js & npm](https://nodejs.org/en/download/)

## Set up Rust Project

Exonum is written in Rust, therefore, you need a stable Rust compiler for this
tutorial. Refer to our [Installation Guide](./install.md) for detailed
instructions on setting up the required environment.

The very first step of developing a service, is creating a crate and adding
the necessary dependencies to it.

```bash
cargo new exonum-demo-timestamping
```

Add necessary dependencies to `Cargo.toml` in the project directory:

```toml
[package]
name = "exonum-demo-timestamping"
version = "0.0.0"
publish = false
authors = ["Your name <your@email.com>"]

[dependencies]
exonum = "0.10.3"
exonum-configuration = "0.10.2"
exonum-time = "0.10.2"
exonum-derive = "0.10.0"
serde = "1.0.10"
serde_derive = "1.0.10"
serde_json = "1.0.2"
failure = "0.1.5"
log = "0.4.6"
chrono = { version = "0.4.6", features = ["serde"] }
protobuf = "2.2.0"

[build-dependencies]
exonum-build = "0.10.0"

[features]
default = ["with-serde"]
with-serde = []
```

Also, you can add the following dependencies to `Cargo.toml`
for future testing purposes:

```toml
[dev-dependencies]
exonum-testkit = "0.10.2"
pretty_assertions = "0.5.1"
```

## Imports

The default entry point for Rust crates is [src/lib.rs][src/lib.rs]. This is
where we indicate the external libraries required for our service.

??? note "Imports"

    ```rust
    extern crate exonum;
    extern crate exonum_time;
    #[macro_use]
    extern crate exonum_derive;
    #[macro_use]
    extern crate failure;
    #[macro_use]
    extern crate log;
    #[macro_use]
    extern crate serde_derive;

    pub mod api;
    pub mod proto;
    pub mod schema;
    pub mod transactions;

    use exonum::{
        api::ServiceApiBuilder,
        blockchain::{self, Transaction, TransactionSet},
        crypto::Hash,
        helpers::fabric,
        messages::RawTransaction,
        storage::Snapshot,
    };

    use crate::{api::PublicApi, schema::Schema, transactions::TimeTransactions};
    ```

As we have subdivided the code into several files corresponding to service
modules, besides the imports, we also need to indicate these modules
in [src/lib.rs][src/lib.rs]:

```rust
pub mod api;
pub mod proto;
pub mod schema;
pub mod transactions;
```

## Constants

Next, let's declare the constants which will be used in the service. These
include the ID of our Timestamping Service and its name.

!!! note
    The ID and name of the service should be unique for every service
    you are running in the blockchain.

```rust
const TIMESTAMPING_SERVICE: u16 = 130;
pub const SERVICE_NAME: &str = "timestamping";
```

## Define protobuf structures

Create new `proto` directory inside `src`:
```bash
mkdir proto
```

Inside `proto` directory create two files: `timestamping.proto` and `mod.rs`.
Define protobuf structures in `timestamping.proto`:

```protobuf
syntax = "proto3";

package exonum.examples.timestamping;

import "helpers.proto";
import "google/protobuf/timestamp.proto";

// Stores content's hash and some metadata about it.
message Timestamp {
  exonum.Hash content_hash = 1;
  string metadata = 2;
}

message TimestampEntry {
  // Timestamp data.
  Timestamp timestamp = 1;
  // Hash of transaction.
  exonum.Hash tx_hash = 2;
  // Timestamp time.
  google.protobuf.Timestamp time = 3;
}

/// Timestamping transaction.
message TxTimestamp { Timestamp content = 1; }
```

You must manually include protobuf files into the project. 
`mod.rs` is responsible for that:

```rust
#![allow(bare_trait_objects)]
#![allow(renamed_and_removed_lints)]

pub use self::timestamping::{Timestamp, TimestampEntry, TxTimestamp};

include!(concat!(env!("OUT_DIR"), "/protobuf_mod.rs"));

use exonum::proto::schema::*;
```

## Generate rust structs from proto files

In the project root create `build.rs` file. Add the following code to `build.rs`:

```rust
extern crate exonum_build;

use exonum_build::{get_exonum_protobuf_files_path, protobuf_generate};

fn main() {
    let exonum_protos = get_exonum_protobuf_files_path();
    protobuf_generate(
        "src/proto",
        &["src/proto", &exonum_protos],
        "protobuf_mod.rs",
    );
}
```

After successful run output directory will contain *.rs for each *.proto file in `"src/proto/**/"` and `example_mod.rs` which will include all generated .rs files as submodules.

## Configure Schema

Schema is a structured view of
[the key-value storage](../architecture/storage.md)
used in Exonum. Exonum services do not access the storage directly; they work
with `Snapshot`s and `Fork`s. A `Snapshot` represents an immutable view
of the storage, while a `Fork` is a mutable one, where changes can be easily
rolled back. `Snapshot`s are used in
[read requests](../architecture/services.md#read-requests), and `Fork`s
are used in transaction processing.

We have separated the code that configures the schema for our Timestamping
Service into a separate file - [src/schema.rs][src/schema.rs]. Here we describe
the main elements with which our service will operate.

### Declare Persistent Data

First of all we have to import required structures:
```rust
use super::proto;
use chrono::{DateTime, Utc};
use exonum::{
    crypto::Hash,
    storage::{Fork, ProofMapIndex, Snapshot},
};
```

As a part of the service schema, we first define the two structures that the
service will be able to save in the Exonum blockchain. This is done using the
`protobuf` structures. 

```rust
/// Stores content's hash and some metadata about it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, ProtobufConvert)]
#[exonum(pb = "proto::Timestamp")]
pub struct Timestamp {
    /// Hash of the content.
    pub content_hash: Hash,

    /// Additional metadata.
    pub metadata: String,
}

impl Timestamp {
    /// Create new Timestamp.
    pub fn new(&content_hash: &Hash, metadata: &str) -> Self {
        Self {
            content_hash,
            metadata: metadata.to_owned(),
        }
    }
}
```

The `Timestamp` structure includes the hash of the submitted file and its
optional description.

```rust
/// Timestamp entry.
#[derive(Clone, Debug, ProtobufConvert)]
#[exonum(pb = "proto::TimestampEntry", serde_pb_convert)]
pub struct TimestampEntry {
    /// Timestamp data.
    pub timestamp: Timestamp,

    /// Hash of transaction.
    pub tx_hash: Hash,

    /// Timestamp time.
    pub time: DateTime<Utc>,
}

impl TimestampEntry {
    /// New TimestampEntry.
    pub fn new(timestamp: Timestamp, &tx_hash: &Hash, time: DateTime<Utc>) -> Self {
        Self {
            timestamp,
            tx_hash,
            time,
        }
    }
}
```

The `TimestampEntry` structure includes the timestamp itself, the hash of the
timestamping transaction and the time when the timestamp was recorded. The time
value is provided by the Exonum Time Oracle.

### Create Schema

As the schema should work with both types of storage views, we declare it as a
generic wrapper:

```rust
#[derive(Debug)]
pub struct Schema<T> {
    view: T,
}
```

We need to implement
[(Debug)](https://doc.rust-lang.org/stable/std/fmt/trait.Debug.html) here to
efficiently process errors during the debugging process.

To access the objects inside the storage, we need to declare the layout of
the data. As we want to keep the timestamps in the storage and be able to
construct proofs for timestamping transactions, we will use an instance of
[`ProofMapIndex`](../architecture/storage.md#proofmapindex). A `ProofMapIndex`
implements a key-value storage and offers the ability to create proofs of
existence for its key-value pairs.

For our new schema, we next implement a method for passing a `Snapshot` to the
Timestamping Service.

```rust
impl<T> Schema<T> {
    /// Creates a new schema from the database view.
    pub fn new(snapshot: T) -> Self {
        Schema { view: snapshot }
    }
}
```

`Snapshot`s provide random access to every piece of data inside the database.
To isolate the timestamping map into a separate entity, we add a unique prefix
to it, which is the first argument to the `ProofMapIndex::new` call:

```rust
impl<T> Schema<T>
where
    T: AsRef<dyn Snapshot>,
{
    /// Returns the `ProofMapIndex` of timestamps.
    pub fn timestamps(&self) -> ProofMapIndex<&T, Hash, TimestampEntry> {
        ProofMapIndex::new("timestamping.timestamps", &self.view)
    }

    /// Returns the hash of the Timestamping Service schema.
    pub fn state_hash(&self) -> Vec<Hash> {
        vec![self.timestamps().merkle_root()]
    }
}
```

Here we have declared a constructor and two getter methods:

- the `timestamps` method returns the list of all existing timestamps by
  building a `ProofMapIndex`
- the `state_hash` method takes the hashes of all existing timestamps and
  calculates the resulting hash of the blockchain state.

As we will need to add entries to the database to record timestamps, we also
declare two methods for a `Fork`-based schema:

```rust
impl<'a> Schema<&'a mut Fork> {
    /// Returns the mutable `ProofMapIndex` of timestamps.
    pub fn timestamps_mut(
        &mut self
    ) -> ProofMapIndex<&mut Fork, Hash, TimestampEntry> {
        ProofMapIndex::new("timestamping.timestamps", &mut self.view)
    }

    /// Adds the timestamp entry to the database.
    pub fn add_timestamp(&mut self, timestamp_entry: TimestampEntry) {
        let timestamp = timestamp_entry.timestamp.clone();
        let content_hash = &timestamp.content_hash;

        // Checks that timestamp with given content_hash does not exist.
        if self.timestamps().contains(content_hash) {
            return;
        }

        // Adds timestamp.
        self.timestamps_mut().put(content_hash, timestamp_entry);
    }
}
```

- the `timestamps_mut` method returns a mutable `ProofMapIndex` of the
  timestamping map
- the `add_timestamp` method  adds a new timestamp which contains the timestamp
  entry we have defined previously and the hash of the timestamp. The
  hash acts as the key of the `ProofMapIndex`, and the timestamp entry as the
  value. This method also checks if a timestamp with the given hash already
  exists in the blockchain.

## Configure Transactions

[Transactions](../architecture/transactions.md) resemble messages and
perform atomic actions on the blockchain state. We have separated the code that
configures transactions for our Timestamping Service into a separate file -
[src/transactions.rs][src/transactions.rs]. The Timestamping Service we are
creating requires a single transaction type - adding timestamps to the
blockchain.

First, we import the structures we need from Exonum core and the Time Oracle.
Here we also indicate a connection to the schema we have configured previously
in [src/schema.rs][src/schema.rs] and the `TIMESTAMPING_SERVICE` constant
declared in [src/lib.rs][src/lib.rs].

```rust
#![allow(bare_trait_objects)]

use exonum::{
    blockchain::{ExecutionError, ExecutionResult, Transaction, TransactionContext},
    crypto::{PublicKey, SecretKey},
    messages::{Message, RawTransaction, Signed},
};
use exonum_time::schema::TimeSchema;

use super::proto;
use crate::{
    schema::{Schema, Timestamp, TimestampEntry},
    TIMESTAMPING_SERVICE,
};
```

Service transactions are defined through the `protobuf`:

```rust
/// Timestamping transaction.
#[derive(Serialize, Deserialize, Clone, Debug, ProtobufConvert)]
#[exonum(pb = "proto::TxTimestamp")]
pub struct TxTimestamp {
    /// Timestamp content.
    pub content: Timestamp,
}

/// Transaction group.
#[derive(Serialize, Deserialize, Clone, Debug, TransactionSet)]
pub enum TimeTransactions {
    /// A timestamp transaction.
    TxTimestamp(TxTimestamp),
}

impl TxTimestamp {
    #[doc(hidden)]
    pub fn sign(author: &PublicKey, content: Timestamp, key: &SecretKey) -> Signed<RawTransaction> {
        Message::sign_transaction(Self { content }, TIMESTAMPING_SERVICE, *author, key)
    }
}
```

The transaction to create a timestamping transaction (`TxTimestamp`) contains
the timestamp - the hash of the submitted file.

### Reporting Errors

We next define the error which might occur when processing transactions in our
service. The current Timestamping Service includes only one error, which
occurs when a timestamp with the given hash already exists in the blockchain.

```rust
#[derive(Debug, Fail)]
#[repr(u8)]
pub enum Error {
    /// Content hash already exists.
    #[fail(display = "Content hash already exists")]
    HashAlreadyExists = 0,
}
```

Here we automatically implement the `Debug` and `Fail` traits for the `Error`
enum using the `#[derive(Debug, Fail)]` command.

The `#[fail(display = "Content hash already exists")]` attribute sets the
message which will be displayed in case the error occurs.

The `#[repr(u8)]` attribute defines that the `Error` enum will be represented
as a `u8` variable in memory.

Next, we describe how to transform the `Error` enum into `ExecutionError` of
the Exonum core.

```rust
impl From<Error> for ExecutionError {
    fn from(value: Error) -> ExecutionError {
        let description = value.to_string();
        ExecutionError::with_description(value as u8, description)
    }
}
```

The `ExecutionError` will have the description we have indicated
for the `Error` enum.

### Transaction Execution

Every transaction in Exonum has business logic of the blockchain attached,
which is encapsulated in the `Transaction` trait. This trait includes the `execute`
method which contains logic applied to the storage when a transaction is
executed. The `Transaction` trait needs to be implemented for all transactions
which are to be used in Exonum.

`execute` performs the following operations:

1. Gets the current time value provided by the Time Oracle. If the system
   cannot get the time value, it will output the corresponding error.
2. Takes the content of the transaction and calculates its hash.
3. Checks whether a timestamp with the same hash already exists in the
   blockchain. If a timestamp with such a hash is found, the system will
   output the corresponding error.
4. Creates a new entry in the database `Fork`, which includes the content of
   the transaction, its hash and the current time value.

```rust
impl Transaction for TxTimestamp {
    fn execute(&self, mut context: TransactionContext) -> ExecutionResult {
        let tx_hash = context.tx_hash();
        let time = TimeSchema::new(&context.fork())
            .time()
            .get()
            .expect("Can't get the time");

        let hash = &self.content.content_hash;

        let mut schema = Schema::new(context.fork());
        if let Some(_entry) = schema.timestamps().get(hash) {
            Err(Error::HashAlreadyExists)?;
        }

        trace!("Timestamp added: {:?}", self);
        let entry = TimestampEntry::new(self.content.clone(), &tx_hash, time);
        schema.add_timestamp(entry);
        Ok(())
    }
}
```

## Configure API Endpoints

Next, we need to implement the node API. We have separated the code that
configures API endpoints for our Timestamping Service into a separate file -
[src/api.rs][src/api.rs].

Required imports:
```rust
use exonum::{
    api::{self, ServiceApiBuilder, ServiceApiState},
    blockchain::{self, BlockProof},
    crypto::Hash,
    storage::MapProof,
};

use crate::{
    schema::{Schema, TimestampEntry},
    TIMESTAMPING_SERVICE,
};
```

First, we need to define the structures required to implement the API
endpoints. For our Timestamping Service, we will define the following three
structures:

- the `TimestampQuery` structure which contains the hash of a
  timestamp:

  ```rust
  /// Describes query parameters for `handle_timestamp` and `handle_timestamp_proof` endpoints.
  #[derive(Debug, Clone, Copy, Serialize, Deserialize)]
  pub struct TimestampQuery {
      /// Hash of the requested timestamp.
      pub hash: Hash,
  }

  impl TimestampQuery {
      /// Creates new `TimestampQuery` with given `hash`.
      pub fn new(hash: Hash) -> Self {
          TimestampQuery { hash }
      }
  }
  ```

- the `TimestampProof` structure which contains all the data required to prove
  that a timestamping transaction has been included into the blockchain:

  ```rust
  /// Describes the information required to prove the correctness of the timestamp entries.
  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct TimestampProof {
      /// Proof of the last block.
      pub block_info: BlockProof,
      /// Actual state hashes of the Timestamping Service with their proofs.
      pub state_proof: MapProof<Hash, Hash>,
      /// Proof of existence of a specific entry in the timestamping database.
      pub timestamp_proof: MapProof<Hash, TimestampEntry>,
  }
  ```

- the `PublicApi` structure which enables us to implement public API endpoints
  for our service:

  ```rust
  #[derive(Debug, Clone, Copy)]
  pub struct PublicApi;
  ```

Now we are ready to define the two endpoints required for our service:

```rust
pub fn handle_timestamp(
    state: &ServiceApiState,
    query: TimestampQuery,
) -> api::Result<Option<TimestampEntry>> {
    let snapshot = state.snapshot();
    let schema = Schema::new(&snapshot);
    Ok(schema.timestamps().get(&query.hash))
}
```

The `handle_timestamp` method takes the hash of a timestamp and
checks whether a timestamp with this hash exists in the current state of the
blockchain. To apply this method, the user needs to know the hash of the
timestamp in question. To perform the check, the method makes a snapshot of
the current state of the blockchain.

```rust
pub fn handle_timestamp_proof(
    state: &ServiceApiState,
    query: TimestampQuery,
) -> api::Result<TimestampProof> {
    let snapshot = state.snapshot();
    let (state_proof, block_info) = {
        let core_schema = blockchain::Schema::new(&snapshot);
        let last_block_height = state.blockchain().last_block().height();
        let block_proof = core_schema
            .block_and_precommits(last_block_height).unwrap();
        let state_proof = core_schema
            .get_proof_to_service_table(TIMESTAMPING_SERVICE, 0);
        (state_proof, block_proof)
    };
    let schema = Schema::new(&snapshot);
    let timestamp_proof = schema.timestamps().get_proof(query.hash);
    Ok(TimestampProof {
        block_info,
        state_proof,
        timestamp_proof,
    })
}
```

`handle_timestamp_proof` takes the hash of a timestamping
transaction and constructs a proof of its inclusion into the blockchain. To
construct the proof structure, the method above performs a number of operations
separated into two sets:

The first set contains the operations that prove the correctness of
structures related to the timestamping transaction:

- creates a `Snapshot` of the blockchain in its current state
- finds the latest block of the blockchain
- takes that latest block and its precommit messages
- takes the proof structure that proves the correctness of the service table,
  in this case the table of our Timestamping Service. This operation checks
  whether the table of a certain service is included into the blockchain
- returns proofs of the latest block and the Timestamping Service table.

The second set contains the operations that prove the correctness of the
timestamping transaction itself and construct a proof for it:

- creates a Timestamping Service schema using the `Snapshot` of the current
  blockchain state
- finds the timestamping transaction proof using its hash
- returns the proof of the timestamping transaction which is comprised of the
  proofs of the latest blockchain block, Timestamping Service table and the
  timestamping transaction.

As a result of the operations above, the `handle_timestamp_proof` method proves
that the timestamping transaction in question is correct, the latest blockchain
block is correct and the Timestamping Service table that contains all data on
the existing timestamps is also correct. This set of data is sufficient to
trust that the timestamping transaction is legitimate.

Finally, having defined our API methods, we can connect them to certain
endpoints:

```rust
pub fn wire(builder: &mut ServiceApiBuilder) {
    builder
        .public_scope()
        .endpoint("v1/timestamps/value", Self::handle_timestamp)
        .endpoint("v1/timestamps/proof", Self::handle_timestamp_proof);
}
```

As we intend for the endpoints to be accessible to external users, we declare
them as within the `public_scope` of API endpoints. We create the following
endpoints:

- For the `handle_timestamp` method we declare the `v1/timestamps/value` route,
  which will be used for checking whether a certain timestamping transaction
  exists in the blockchain.
- For the `handle_timestamp_proof` method we declare the `v1/timestamps/proof`
  route, which will be used for getting proofs of correctness of certain
  timestamping transactions.


## Define Service

Service is a group of templated transactions (we have defined them before).
It has a name and a unique ID to determine the service inside the blockchain.
We define our new service in [src/lib.rs][src/lib.rs]:

```rust
#[derive(Debug, Default)]
pub struct Service;
```

To turn `Service` into a blockchain service, we need to implement the Exonum
`Service` trait for it.

!!! tip
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

    fn tx_from_raw(
        &self,
        raw: RawTransaction,
    ) -> Result<Box<dyn Transaction>, failure::Error> {
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
- `tx_from_raw` - deserialization of transactions processed by the service.
  If the incoming transaction is built successfully, we put it into
  a `Box<_>`.
- `wire_api` - connects the API endpoints of the service to the API of the
  blockchain.

## Create Service Instance

We define the `ServiceFactory` structure in [src/lib.rs][src/lib.rs]. This
structure builds an instance of our service.

```rust
#[derive(Debug, Clone, Copy)]
pub struct ServiceFactory;
```

The `ServiceFactory` returns the name of the service and comprises the
`make_service` function which will later allow us to include the new service
into the `NodeBuilder`.

```rust
impl fabric::ServiceFactory for ServiceFactory {
    fn service_name(&self) -> &str {
        SERVICE_NAME
    }

    fn make_service(&mut self, _: &fabric::Context)
     -> Box<dyn blockchain::Service> {
        Box::new(Service)
    }
}
```

## Create Builder for Exonum Node with Timestamping

As the final step of configuring the backend of our Timestamping Service, we
add the [src/main.rs][src/main.rs] file, which lets us launch an Exonum node
with additional services.

In this file we import Exonum, its Configuration Service, the Time Oracle which
will provide the current time values and the Timestamping Service itself.

```rust
use exonum::helpers::fabric::NodeBuilder;

fn main() {
    exonum::helpers::init_logger().unwrap();
    NodeBuilder::new()
        .with_service(Box::new(exonum_configuration::ServiceFactory))
        .with_service(Box::new(exonum_time::TimeServiceFactory))
        .with_service(Box::new(exonum_demo_timestamping::ServiceFactory))
        .run();
}
```

When called, the `main` function will launch an Exonum node with the
Configuration, Time and Timestamping services.

The backend part of our Timestamping Service is now ready for use.
Refer to our [Github][timestamping] repository to view the code of the service,
the frontend we have added and the instructions on launching our demo
Timestamping Service.

## Start the Blockchain Network

Now that our service is ready, we can start up a network of four nodes running
Exonum with the Timestamping Service we have created. All these steps are to be
performed in the directory containing `Cargo.toml`.

<!-- markdownlint-disable MD013 -->

1. Install the actual node binary:

   ```shell
   cargo install --path .
   ```

2. Generate blockchain configuration for the network we are setting up:

   ```shell
   mkdir example
   exonum-demo-timestamping generate-template example/common.toml --validators-count 4
   ```

3. Generate templates of node configurations indicating the addresses which the
   nodes will use for communication.

   ```shell
   exonum-demo-timestamping generate-config example/common.toml \
       example/pub_1.toml example/sec_1.toml --peer-address 127.0.0.1:6331
   exonum-demo-timestamping generate-config example/common.toml \
       example/pub_2.toml example/sec_2.toml --peer-address 127.0.0.1:6332
   exonum-demo-timestamping generate-config example/common.toml \
       example/pub_3.toml example/sec_3.toml --peer-address 127.0.0.1:6333
   exonum-demo-timestamping generate-config example/common.toml \
       example/pub_4.toml example/sec_4.toml --peer-address 127.0.0.1:6334
   ```

4. Finalize the generation of node configurations indicating the following
   information: the ports which will be used for private and public APIs; the
   private configuration file for this node; the file with the node
   configuration; and the public configuration files of all the validator
   nodes. If you do not include the public configuration file of a certain
   node, such a node will be regarded as an auditor by the validator nodes.

   ```shell
   exonum-demo-timestamping finalize \
       --public-api-address 0.0.0.0:8200 \
       --private-api-address 0.0.0.0:8091 example/sec_1.toml \
       example/node_1_cfg.toml \
       --public-configs \
       example/pub_1.toml \
       example/pub_2.toml \
       example/pub_3.toml \
       example/pub_4.toml
   exonum-demo-timestamping finalize \
       --public-api-address 0.0.0.0:8201 \
       --private-api-address 0.0.0.0:8092 example/sec_2.toml \
       example/node_2_cfg.toml \
       --public-configs \
       example/pub_1.toml \
       example/pub_2.toml \
       example/pub_3.toml \
       example/pub_4.toml
   exonum-demo-timestamping finalize \
       --public-api-address 0.0.0.0:8202 \
       --private-api-address 0.0.0.0:8093 example/sec_3.toml \
       example/node_3_cfg.toml \
       --public-configs \
       example/pub_1.toml \
       example/pub_2.toml \
       example/pub_3.toml \
       example/pub_4.toml
   exonum-demo-timestamping finalize \
       --public-api-address 0.0.0.0:8203 \
       --private-api-address 0.0.0.0:8094 example/sec_4.toml \
       example/node_4_cfg.toml \
       --public-configs \
       example/pub_1.toml \
       example/pub_2.toml \
       example/pub_3.toml \
       example/pub_4.toml
   ```

5. Run the nodes, each in a separated terminal, indicating the file to which
   the database will be written. To enable logs, use the `RUST_LOG` variable.

   ```shell
   exonum-demo-timestamping run --node-config example/node_1_cfg.toml \
       --db-path example/db1 --public-api-address 0.0.0.0:8200
   exonum-demo-timestamping run --node-config example/node_2_cfg.toml \
       --db-path example/db2 --public-api-address 0.0.0.0:8201
   exonum-demo-timestamping run --node-config example/node_3_cfg.toml \
       --db-path example/db3 --public-api-address 0.0.0.0:8202
   exonum-demo-timestamping run --node-config example/node_4_cfg.toml \
       --db-path example/db4 --public-api-address 0.0.0.0:8203
   ```

<!-- markdownlint-enable MD013 -->

Now you have four nodes running Exonum blockchain with Timestamping Service.
You can interact with this blockchain using API requests.

## Interact with the Timestamping Service

Below you can find examples of API requests which can be sent to the
Timestamping Service with response examples.

### Create Timestamp

To add a new timestamp create a `create-timestamp-1.json` file and insert the
following code into it:

```json
{"tx_body": "29f4cf5b4e977d86b9461ce7603ee271f0e5df0fad68afb89fc708371fb245540000820000000a2a0a220a201099d7d9042172425546d8e1d64074aeaa247e91365c378ba3ca695a501c1bca120474657374c14f9384cbf138f248fc4555c27c56dc01f4dee5e9a751ff99fea4a5c88fd46400d43ded634d76245b20a239429b26b599a26180f269cc49aa66d607f4733706"}
```

Use the `curl` command to send this transaction to the node by HTTP:

```shell
curl -H "Content-Type: application/json" -X POST -d @create-timestamp-1.json \
    http://127.0.0.1:8200/api/explorer/v1/transactions
```

??? note "Response example"

    ```json
    {"tx_hash":"add5cf2617b1253afb3fbd24837935e39ec1ce1de3a3fad331deda652c6dad9d"}
    ```

The request returns the hash of the transaction.

### Get Information on a Timestamp

To retrieve information about an existing timestamp by its hash, use the following request:

```shell
curl http://127.0.0.1:8200/api/services/timestamping/v1/timestamps/value?hash=1099d7d9042172425546d8e1d64074aeaa247e91365c378ba3ca695a501c1bca
```

??? note "Response example"

    ```json
    {
        "timestamp": {
            "content_hash": {
                "data": [16, 153, 215, 217, 4, 33, 114, 66, 85, 70, 216, 225, 214, 64, 116, 174, 170, 36, 126, 145, 54, 92, 55, 139, 163, 202, 105, 90, 80, 28, 27, 202]
            },
            "metadata": "test"
        },
        "tx_hash": {
            "data": [173, 213, 207, 38, 23, 177, 37, 58, 251, 63, 189, 36, 131, 121, 53, 227, 158, 193, 206, 29, 227, 163, 250, 211, 49, 222, 218, 101, 44, 109, 173, 157]
        },
        "time": {
            "seconds": 1550769625,
            "nanos": 347857000
        }
    }
    ```

The request returns the following information:

- the time when the timestamp was created
- the hash of the timestamp
- the description of the timestamp
- the hash of the timestamping transaction

### Get Proof for a Timestamp

To retrieve a proof for an existing timestamp by its hash, use the following request:

```shell
curl http://127.0.0.1:8200/api/services/timestamping/v1/timestamps/proof?hash=1099d7d9042172425546d8e1d64074aeaa247e91365c378ba3ca695a501c1bca
```

??? note "Response example"

    ```json
    {
        "block_info": {
            "block": {
                "proposer_id": 2,
                "height": 4349,
                "tx_count": 4,
                "prev_hash": "9f70dd5916aeef649ff012ab0003214626bca68f6d39cb7f623b4ce6ea3c4b6c",
                "tx_hash": "6cae88e605e589930386cd6400dfd346b034a727a2b5f5f6c5c35d1015eb33a7",
                "state_hash": "9c5f13715bbbc344c7c040287112fd656dc2d8a94a42facb1a1d2e5364b8b133"
            },
            "precommits": ["356dbfb22307417a064f1d4df29066c40b92a3276bff40aba4607f845d816c25010010fd21180122220a208ff2709d7a89def8d9df521bd14f16520e08cff6a8cb7481dc1e36474954175d2a220a204b4de16feabe338b0fdde828f89639965604a81d0530058669c6e40f391d57b8320b08fabdbbe30510d0cec9345d52182b5d5fac43cd0560d8f670e6ecd1ca4551a3cba0d90a460df73f24b0596f6ad181fa20e39c9c04fd6c36000bb3c993ed4abc4a22df8ac3c417df504e0e", "7108c24cde5165125ee5684d9a10b0f64af897b0b3ab0f5fd6d0762ad39851e60100080210fd21180122220a208ff2709d7a89def8d9df521bd14f16520e08cff6a8cb7481dc1e36474954175d2a220a204b4de16feabe338b0fdde828f89639965604a81d0530058669c6e40f391d57b8320b08fabdbbe30510d0d7c63406c6e754c86c614c72c1e562bd7ebc2b2825cb14b3c6f8cab8197451ad8bb3b2eb92d456bcc04c1a2ca4c12e1fa15eb9e1b82743641a5ea03ba923407d2d970d", "5a25a06bb78f01022cb55922f4a3d269e3cd2d5d73748eef018c718dd785d5730100080110fd21180122220a208ff2709d7a89def8d9df521bd14f16520e08cff6a8cb7481dc1e36474954175d2a220a204b4de16feabe338b0fdde828f89639965604a81d0530058669c6e40f391d57b8320b08fabdbbe3051098a5cf34e8b1ef7419a3eedab88f3701645ca83d2f247d6c6d6fa74f8d051c44b542aa4d0ba4875a38e3dd460ff13340b0438cae0ecde842f2002c6323a8515efb43ac04"]
        },
        "state_proof": {
            "entries": [{
                "key": "775be457774803ff0221f0d18f407c9718a2f4c635445a691f6061bd5d651581",
                "value": "631b20b61ff068db4a4e2884e543b1aea2b5f12b10199b19d0cc635310ade73c"
            }],
            "proof": [{
                "path": "0000101010101110110000001010110110011000000001100011001110110111000101011001101100100100000010011111001000011101110010101110111001111111101111101110100011111110000111011111101111110011011010100100110101110010101000101110101000100110011100100010101101100001",
                "hash": "0000000000000000000000000000000000000000000000000000000000000000"
            }, {
                "path": "1101",
                "hash": "17bb01ba591eacc7971d7694d2779263839fa4347539e850a497d83816ade1a0"
            }, {
                "path": "1110011011010101101110110100111000001000001001000000111111111111011100101101000011111100001100101111010010000011110111001010001101011101001010111011010011010000000111101000101000101011011010100001101110110001000001001011110010101000010101010010010100001010",
                "hash": "0000000000000000000000000000000000000000000000000000000000000000"
            }, {
                "path": "1111101111111100100001100001100100100000100101011111010011011011000000101110101010011000101101000010001110111100111010110001001001010111111011100101000100111011010010100011110110010010001100010001011110100000001001000000001100101000000111011000100010011000",
                "hash": "e7b1255594e9941a3663a71863c89b19af900e352dafc4a0124f8b1b637b6a3c"
            }]
        },
        "timestamp_proof": {
            "entries": [{
                "key": "1099d7d9042172425546d8e1d64074aeaa247e91365c378ba3ca695a501c1bca",
                "value": {
                    "timestamp": {
                        "content_hash": {
                            "data": [16, 153, 215, 217, 4, 33, 114, 66, 85, 70, 216, 225, 214, 64, 116, 174, 170, 36, 126, 145, 54, 92, 55, 139, 163, 202, 105, 90, 80, 28, 27, 202]
                        },
                        "metadata": "test"
                    },
                    "tx_hash": {
                        "data": [173, 213, 207, 38, 23, 177, 37, 58, 251, 63, 189, 36, 131, 121, 53, 227, 158, 193, 206, 29, 227, 163, 250, 211, 49, 222, 218, 101, 44, 109, 173, 157]
                    },
                    "time": {
                        "seconds": 1550769625,
                        "nanos": 347857000
                    }
                }
            }],
            "proof": []
        }
    }
    ```

The request returns the following components of the timestamp proof:

- the proof of the last block in the blockchain
- the proof of the Timestamping Service table
- the proof of the timestamp itself

Great! You have created a fully functional Timestamping Service.

Next you can refer to [cryptocurrency](create-service.md),
[cryptocurrency advanced](data-proofs.md) and
[Exonum light client](light-client.md) for our other
tutorials.

Stay tuned for news about updates to the Exonum platform in
our [blog](https://exonum.com/blog/).

[timestamping]: https://github.com/exonum/exonum/tree/master/examples/timestamping
[demo-data-proofs]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced
[demo-service]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency
[src/lib.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/lib.rs
[src/transactions.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/transactions.rs
[src/schema.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/schema.rs
[src/api.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/api.rs
[src/main.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/main.rs
[client]: https://github.com/exonum/exonum-client
