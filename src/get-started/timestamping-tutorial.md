# Create Timestamping Service

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
cargo new timestamping
```

Add necessary dependencies to `Cargo.toml` in the project directory:

```toml
[package]
name = "exonum-timestamping"
version = "0.0.0"
publish = false
authors = ["Your name <your@email.com>"]

[dependencies]
exonum = { version = "0.9.0", path = "../../../exonum" }
exonum-time = { version = "0.9.0", path = "../../../services/time" }
serde = "1.0.10"
serde_derive = "1.0.10"
serde_json = "1.0.2"
failure = "0.1.2"
log = "=0.4.3"
chrono = { version = "=0.4.5", features = ["serde"] }

[dependencies.exonum-configuration]
version = "0.9.0"
path = "../../../services/configuration"
```

Also, you can add the following dependencies to `Cargo.toml`
for future testing purposes:

```toml
[dev-dependencies]
exonum-testkit = { version = "0.9.0", path = "../../../testkit" }
pretty_assertions = "=0.5.1"
```

## Imports

The default entry point for Rust crates is [src/lib.rs][src/lib.rs]. This is
where we indicate the external libraries required for our service.

??? note "Imports"

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
        api::ServiceApiBuilder,
        blockchain::{self, Transaction, TransactionSet},
        crypto::Hash,
        encoding::Error as StreamStructError,
        helpers::fabric, messages::RawTransaction,
        storage::Snapshot,
    };

    use api::PublicApi;
    use schema::Schema;
    use transactions::TimeTransactions;
    ```

As we have subdivided the code into several files corresponding to service
modules, besides the imports, we also need to indicate these modules
in [src/lib.rs][src/lib.rs]:

```rust
pub mod api;
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

## Configure Schema

Schema is a structured view of
[the key-value storage](../architecture/storage.md)
used in Exonum. Exonum services do not access the storage directly; they work
with `Snapshot`s and `Fork`s. A `Snapshot` represents an immutable view
of the storage, while a `Fork` is a mutable one, where changes can be easily
rolled back. `Snapshot`s are used in
[read requests](../architecture/services.md#read-requests), and `Fork`s
are used in transaction processing.

We have separated the code that configures the schema for our timestamping
service into a separate file - [src/schema.rs][src/schema.rs]. Here we describe
the main elements with which our service will operate.

### Declare Persistent Data

As a part of the service schema, we first define the two structures that the
service will be able to save in the Exonum blockchain. This is done using the
`encoding_struct!` macro, which helps declare
[serializable](../architecture/serialization.md) structures and determine the
bounds of their fields.

```rust
encoding_struct! {
    /// Stores the hash of the content and some metadata about it.
    struct Timestamp {
        /// Hash of the content.
        content_hash: &Hash,
        /// Additional metadata.
        metadata: &str,
    }
}
```

The `Timestamp` structure includes the hash of the submitted file and its
optional description.

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
        let timestamp = timestamp_entry.timestamp();
        let content_hash = timestamp.content_hash();

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
use exonum::{
    blockchain::{ExecutionError, ExecutionResult, Transaction},
    crypto::{CryptoHash, PublicKey},
    messages::Message, storage::Fork,
};
use exonum_time::schema::TimeSchema;

use schema::{Schema, Timestamp, TimestampEntry};
use TIMESTAMPING_SERVICE;
```

Service transactions are defined through the `transactions!` macro which
automatically assigns transaction IDs based on the declaration order:

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

The transaction to create a timestamping transaction (`TxTimestamp`) contains
the public key of the user, which is applied for digital signing of
transactions, and the timestamp - the hash of the submitted file. For
simplicity, users in the given service do not have a fixed key pair assigned
to them. Instead, a new key pair is generated for each new timestamping
transaction.

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
which is encapsulated in the `Transaction` trait. This trait includes the
`verify` method to check the integrity of the transaction, and the `execute`
method which contains logic applied to the storage when a transaction is
executed. The `Transaction` trait needs to be implemented for all transactions
which are to be used in Exonum.

In our case, `verify` for the timestamping transaction checks the transaction
signature, while `execute` performs the following operations:

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

## Configure API Endpoints

Next, we need to implement the node API. We have separated the code that
configures API endpoints for our Timestamping Service into a separate file -
[src/api.rs][src/api.rs].

First, we need to define the structures required to implement the API
endpoints. For our Timestamping Service, we will define the following three
structures:

- the `TimestampQuery` structure which contains the hash of a
  timestamp:

  ```rust
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
  pub struct PublicApi;
  ```

Now we are ready to define the three endpoints required for our service:

```rust
pub fn handle_post_transaction(
    state: &ServiceApiState,
    transaction: TxTimestamp,
) -> api::Result<Hash> {
    let hash = transaction.hash();
    state.sender().send(transaction.into())?;
    Ok(hash)
}
```

The `handle_post_transaction` function sends a timestamping transaction to the
blockchain performing the following operations:

- takes a timestamping transaction
- calculates its hash
- sends it to the blockchain network, using the methods defined in Exonum
- returns the hash of the transaction to the user.

After the transaction is successfully completed, the system returns the hash
of the timestamping transaction.

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
        .endpoint("v1/timestamps/proof", Self::handle_timestamp_proof)
        .endpoint_mut("v1/timestamps", Self::handle_post_transaction);
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
- For the `handle_post_transaction` method we declare the `v1/timestamps`
  route, which will be used for sending timestamping transactions to the
  blockchain network.

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

    fn tx_from_raw(
        &self,
        raw: RawTransaction,
    ) -> Result<Box<dyn Transaction>, StreamStructError> {
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

    fn make_service(
        &mut self,
        _: &fabric::Context,
    ) -> Box<dyn blockchain::Service> {
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
fn main() {
    exonum::helpers::init_logger().unwrap();
    NodeBuilder::new()
        .with_service(Box::new(exonum_configuration::ServiceFactory))
        .with_service(Box::new(exonum_time::TimeServiceFactory))
        .with_service(Box::new(exonum_timestamping::ServiceFactory))
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

1. Install the actual node binary:

   ```none
   cargo install
   ```

2. Generate blockchain configuration for the network we are setting up:

   ```none
   mkdir example
   exonum-timestamping generate-template example/common.toml --validators-count 4
   ```

3. Generate templates of node configurations indicating the addresses which the
   nodes will use for communication.

   ```none
   exonum-timestamping generate-config example/common.toml \
       example/pub_1.toml example/sec_1.toml --peer-address 127.0.0.1:6331
   exonum-timestamping generate-config example/common.toml \
       example/pub_2.toml example/sec_2.toml --peer-address 127.0.0.1:6332
   exonum-timestamping generate-config example/common.toml \
       example/pub_3.toml example/sec_3.toml --peer-address 127.0.0.1:6333
   exonum-timestamping generate-config example/common.toml \
       example/pub_4.toml example/sec_4.toml --peer-address 127.0.0.1:6334
   ```

4. Finalize the generation of node configurations indicating the following
   information: the ports which will be used for private and public APIs; the
   private configuration file for this node; the file with the node
   configuration; and the public configuration files of all the validator
   nodes. If you do not include the public configuration file of a certain
   node, such a node will be regarded as an auditor by the validator nodes.

   ```none
   exonum-timestamping finalize example/node_1_cfg.toml \
       --public-api-address 0.0.0.0:8200 \
       --private-api-address 0.0.0.0:8091 example/sec_1.toml \
       --public-configs \
       example/pub_1.toml \
       example/pub_2.toml \
       example/pub_3.toml \
       example/pub_4.toml
   exonum-timestamping finalize example/node_2_cfg.toml \
       --public-api-address 0.0.0.0:8201 \
       --private-api-address 0.0.0.0:8092 example/sec_2.toml \
       --public-configs \
       example/pub_1.toml \
       example/pub_2.toml \
       example/pub_3.toml \
       example/pub_4.toml
   exonum-timestamping finalize example/node_3_cfg.toml \
       --public-api-address 0.0.0.0:8202 \
       --private-api-address 0.0.0.0:8093 example/sec_3.toml \
       --public-configs \
       example/pub_1.toml \
       example/pub_2.toml \
       example/pub_3.toml \
       example/pub_4.toml
   exonum-timestamping finalize example/node_4_cfg.toml \
       --public-api-address 0.0.0.0:8203 \
       --private-api-address 0.0.0.0:8094 example/sec_4.toml \
       --public-configs \
       example/pub_1.toml \
       example/pub_2.toml \
       example/pub_3.toml \
       example/pub_4.toml
   ```

5. Run the nodes, each in a separated terminal, indicating the file to which
   the database will be written. To enable logs, use the `RUST_LOG` variable.

   ```none
   exonum-timestamping run --node-config example/node_1_cfg.toml \
       --db-path example/db1 --public-api-address 0.0.0.0:8200
   exonum-timestamping run --node-config example/node_2_cfg.toml \
       --db-path example/db2 --public-api-address 0.0.0.0:8201
   exonum-timestamping run --node-config example/node_3_cfg.toml \
       --db-path example/db3 --public-api-address 0.0.0.0:8202
   exonum-timestamping run --node-config example/node_4_cfg.toml \
       --db-path example/db4 --public-api-address 0.0.0.0:8203
   ```

Now you have four nodes running Exonum blockchain with Timestamping Service.
You can interact with this blockchain using API requests.

## Interact with the Timestamping Service

Below you can find examples of API requests which can be sent to the
Timestamping Service with response examples.

### Create Timestamp

To add a new timestamp create a `create-timestamp-1.json` file and insert the
following code into it:

```none
{
  “size”: 80,
  “network_id”: 0,
  “protocol_version”: 0,
  “service_id”: 130,
  “message_id”: 0,
  “signature”:“f84e2242d10d92e18a7b256a56dff8fb989269f177f61873f49481dcfcb6c1c783ec59cf63d9716ffa8fde1ca8a43fa2632e119105f5393295c1cea22a3c2a0a”,
  “body”: {
    “pub_key”: “5ce4675f37b6378e869ccc1f9134b3555220d384cf87e73d03d400032015f84d”,
    “content”: {
      “content_hash”: “6e98e39cb76fac1ebdbad8208773589eb6d88b99c025352447c219bc6a4c9f80",
      “metadata”: “test”
    }
  }
}
```

Use the `curl` command to send this transaction to the node by HTTP:

```none
curl -H “Content-Type: application/json” -X POST -d @create-timestamp-1.json \ http://127.0.0.1:8081/api/services/timestamping/v1/timestamps
```

??? note "Response example"

    ```none
    ee1b51883e00c4e62d3204427acc3bf9500bad79e4dde044dffe51c0986bf6d5
    ```

    The request returns the hash of the timestamp.

### Get Information on a Timestamp

To retrieve information about an existing timestamp, use the following request
indicating the hash of the timestamp in question:

```none
curl http://127.0.0.1:8081/api/services/timestamping/v1/timestamps/value?hash=ab2b839d83b1bb728797ffc9778ed6d56a15ab59edb76077454890b5d9c59c68
```

??? note "Response example"

    ```none
    {
    “time”: {
        “nanos”: 133304000,
        “secs”: “1536757761”
    },
    “timestamp”: {
        “content_hash”: “bc3bee69caa664f3020237fc01c1f661898487b3dd33d6848599ac8561501a90",
        “metadata”: “test”
    },
    “tx_hash”: “a980002ef020ea9e9885d5dbe8350d9386049892acb5ca6a798011e490f5a8e5"
    }
    ```

    The request returns the following information:

    - the time when the timestamp was created
    - the hash of the timestamp
    - the description of the timestamp
    - the hash of the timestamping transaction

### Get Proof for a Timestamp

To retrieve a proof for an existing timestamp, use the following request
indicating the hash of the timestamp in question:

```none
curl http://127.0.0.1:8081/api/services/timestamping/v1/timestamps/proof?hash=ab2b839d83b1bb728797ffc9778ed6d56a15ab59edb76077454890b5d9c59c68
```

??? note "Response example"

    ```none
    {
    “block_info”: {
        “block”: {
            “height”: “857",
            “prev_hash”: “f2f4b6778abbbf285efe3cf638a1b36f2eb7e2866a8221933279a68bd24a2da8",
            “proposer_id”: 0,
            “state_hash”: “654fd7bf570242832f2a51d6f3f019deeb2234bbe9cc07feb048880c75963d12”,
            “tx_count”: 3,
            “tx_hash”: “24038928624fc9e10774bf37de85ffb3a2b0f5d14ccd815d06603475b3b93513"
        },
        “precommits”: [{
            “body”: {
                “block_hash”: “68f32d10a4a3f0ef0aaa27145c1f09787f4de63b4d5883fe2e3b854e46d9cef2",
                “height”: “857",
                “propose_hash”: “19a4f9f6c9321f19e63c8ed263d11e6445b58e84214d05d5e0e8782ef58316e8",
                “round”: 1,
                “time”: {
                    “nanos”: 23630000,
                    “secs”: “1536757888”
                },
                “validator”: 1
            },
            “message_id”: 4,
            “protocol_version”: 0,
            “service_id”: 0,
            “signature”: “8a741a19ac88b2c8763654ab367c33cdfce6488b17f520a380d75acdef13611049db3e06cae61661d1d67f17e34728caf38e1ad98ef17ee654e84418ea38c30b”
        }, {
            “body”: {
                “block_hash”: “68f32d10a4a3f0ef0aaa27145c1f09787f4de63b4d5883fe2e3b854e46d9cef2",
                “height”: “857",
                “propose_hash”: “19a4f9f6c9321f19e63c8ed263d11e6445b58e84214d05d5e0e8782ef58316e8",
                “round”: 1,
                “time”: {
                    “nanos”: 23274000,
                    “secs”: “1536757888”
                },
                “validator”: 0
            },
            “message_id”: 4,
            “protocol_version”: 0,
            “service_id”: 0,
            “signature”: “b06526052eecc9da3ebe18a33277c0837485788d31791676b6e869ab527274e1bd6446a4ce6e01d630157fa2dc1976634562b4960a879611d3dd32f18ee6a70b”
        }, {
            “body”: {
                “block_hash”: “68f32d10a4a3f0ef0aaa27145c1f09787f4de63b4d5883fe2e3b854e46d9cef2",
                “height”: “857",
                “propose_hash”: “19a4f9f6c9321f19e63c8ed263d11e6445b58e84214d05d5e0e8782ef58316e8",
                “round”: 1,
                “time”: {
                    “nanos”: 23598000,
                    “secs”: “1536757888”
                },
                “validator”: 2
            },
            “message_id”: 4,
            “protocol_version”: 0,
            “service_id”: 0,
            “signature”: “ddc9e7459a6c785bb6a0dd5bf7d6ddeadbe876a5f9b9c06be1469bd7b1e4d6138230d38b944637d2290475d5c15d0c86f74e45646f838d84be5ae975ad727d09”
        }]
    },
    “state_proof”: {
        “entries”: [{
            “key”: “775be457774803ff0221f0d18f407c9718a2f4c635445a691f6061bd5d651581”,
            “value”: “a12823b8e2b76001acb7f4c117546438d7398a71b1d8883875a9f23ed41fd2a5”
        }],
        “proof”: [{
            “path”: “0000101010101110110000001010110110011000000001100011001110110111000101011001101100100100000010011111001000011101110010101110111001111111101111101110100011111110000111011111101111110011011010100100110101110010101000101110101000100110011100100010101101100001",
            “hash”: “0000000000000000000000000000000000000000000000000000000000000000"
        }, {
            “path”: “1101",
            “hash”: “dea7c92b6c17088b7dbb3d7995737f1e80e89c5950e4263e811f999d004bdaa0"
        }, {
            “path”: “1110011011010101101110110100111000001000001001000000111111111111011100101101000011111100001100101111010010000011110111001010001101011101001010111011010011010000000111101000101000101011011010100001101110110001000001001011110010101000010101010010010100001010",
            “hash”: “0000000000000000000000000000000000000000000000000000000000000000"
        }, {
            “path”: “1111101111111100100001100001100100100000100101011111010011011011000000101110101010011000101101000010001110111100111010110001001001010111111011100101000100111011010010100011110110010010001100010001011110100000001001000000001100101000000111011000100010011000",
            “hash”: “7d5e5b6f055e66b56e3e329c973c12be13b3b4eea9e5400c1e570211d2d5281a”
        }]
    },
    “timestamp_proof”: {
        “entries”: [{
            “key”: “bc3bee69caa664f3020237fc01c1f661898487b3dd33d6848599ac8561501a90",
            “value”: {
                “time”: {
                    “nanos”: 133304000,
                    “secs”: “1536757761”
                },
                “timestamp”: {
                    “content_hash”: “bc3bee69caa664f3020237fc01c1f661898487b3dd33d6848599ac8561501a90",
                    “metadata”: “test”
                },
                “tx_hash”: “a980002ef020ea9e9885d5dbe8350d9386049892acb5ca6a798011e490f5a8e5"
            }
        }],
        “proof”: []
    }
}
    ```

    The request returns the following components of the timestamp proof:

    - the proof of the last block in the blockchain
    - the proof of the Timestamping Service table
    - the proof of the timestamp itself

Great! You have created a fully functional Timestamping Service.

Next you can refer to [Cryptocurrency][Cryptocurrency] and
[Service with Data Proofs][Service with Data Proofs] for our other tutorials.

Stay tuned for news about updates to the Exonum platform in
our [blog](https://exonum.com/blog/).

[timestamping]: https://github.com/exonum/exonum/tree/master/examples/timestamping
[Service with Data Proof]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced
[Cryptocurrency]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency
[src/lib.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/lib.rs
[src/transactions.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/transactions.rs
[src/schema.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/schema.rs
[src/api.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/api.rs
[src/main.rs]: https://github.com/exonum/exonum/blob/master/examples/timestamping/backend/src/main.rs
[client]: https://github.com/exonum/exonum-client
