# Service Testing

You can test Exonum services with the help of the [**exonum-testkit**][exonum-testkit]
crate. The crate allows to test transaction execution and APIs in the synchronous
environment (that is, without consensus algorithm and network operation involved).
Tests are executed in the same system process as the service code itself, allowing
to more easily debug service business logic (for example, panics).

## Installation

In most cases you want to install `exonum-testkit` as a [development dependency][dev-dep],
so it would be compiled for tests only. For this, add the dependency
to the `dev-dependencies` section of the `Cargo.toml` file of your project:

```toml
[dev-dependencies]
exonum-testkit = "0.1.0"
```

!!! note
    The newest version of the testkit crate may differ from the one specified above.
    To find out the newest version, you may look at [the repository page on crates.io][exonum-testkit].

## Simple usage

### Transactions testing

The primary goal of this kind of tests is to check the business logic of your service,
encapsulated in the [`execute` method][Transaction.execute] of transactions.

For writing your first test create `tests` directory according to the cargo
[integration testing manual][integration-tests].
After that, create file `tests/transactions.rs` with the content similar
to the one written below.

```rust
extern crate exonum;
extern crate exonum_testkit;
extern crate my_service;

use my_service::{MyService, MyTransaction, MySchema};
use exonum_testkit::TestKitBuilder;

#[test]
fn test_my_tx() {
    // Create simple testkit network.
    let mut testkit = TestKitBuilder::validator()
        .with_service(MyService::new())
        .create();
    // Create transaction.
    let tx = MyTransaction::new(...);
    // Commit it into blockchain.
    testkit.create_block_with_transactions(txvec![tx]);
    // Check the expected result.
    let snapshot = testkit.snapshot();
    let schema = MySchema::new(&snapshot);
    assert!(schema.is_my_data_checked());
}
```

Make sure that you have full coverage of the business logic in the `execute` method
of your transactions. If you just want to check the `verify` logic in the transaction,
you can do it without testkit in a simple way:

```rust
let tx = MyTransaction::new(...);
assert!(tx.verify());
```

Testkit also allows to check different orderings of transactions, including transactions
for multiple services. This could allow to more efficiently test margin cases
that are quite difficult (but not impossible) to produce in the real network.

```rust
let mut testkit = TestKitBuilder::validator()
    .with_service(MyService::new())
    .with_service(OtherService::new())
    .create();
// Create transactions.
let tx1 = MyTransaction::new(...);
let tx2 = OtherTransaction::new(...);
// Commit them into the blockchain.
testkit.create_block_with_transactions(txvec![tx1, tx2]);
// Check the expected result.
```

### API testing

The basic workflow for testing API endpoints of an Exonum service
with the testkit is as follows:

1. Define the `MyServiceApi` trait for the `TestKitApi` structure that covers
  the whole API of your service.
2. Implement functions that use some transactions as test data to fill the storage.
3. Create the tests that check all of your endpoints.

```rust
// API trait definition.
trait MyServiceApi {
    fn get_public_data(&self) -> PublicDataResponse;
    fn get_private_data(&self) -> PrivateDataResponse;
    fn post_private_data(&self, data: &PrivateData)
        -> PostPrivateDataResponse;
}

impl MyServiceApi for TestKitApi {
    fn get_public_data(&self) -> PublicDataResponse {
        self.get(
            ApiKind::Service("my_service"),
            "/v1/first_endpoint",
        )
    }

    fn get_private_data(&self) -> PrivateDataResponse {
        self.get_private(
            ApiKind::Service("my_service"),
            "/v1/second_endpoint",
        )
    }

    fn post_private_data(&self, data: &PrivateData)
        -> PostPrivateDataResponse
    {
        self.post(
            ApiKind::Service("my_service"),
            "v1/third_endpoint",
            data,
        )
    }
}

#[test]
fn my_api_test() {
    let mut testkit = TestKitBuilder::validator()
        .with_service(MyService::new())
        .create();
    fill_storage_with_data(&mut testkit);
    // Check API responses
    let api = testkit.api();
    assert_eq!(
        api.get_public_data(),
        ApiResponsePublicData::new(...),
    );
    ...
}

// Other tests...
```

In some situations, it can be useful to see the content of requests and
corresponding responses. `exonum-testkit` provides simple logging
implementation for this purpose.
You can use `RUST_LOG` environment variable to enable logs:

```sh
RUST_LOG=exonum_testkit=trace cargo test
```

## Advanced Usage

The testkit allows to test more complex behaviors of Exonum services,
such as getting data from external sources and reconfiguring the service.

### Oracles Testing

The *oracle* is a service which can produce transactions
with external data after commit of the block.
[The Bitcoin anchoring service](bitcoin-anchoring.md) is an example of an oracle.
Just like a real Exonum node, the testkit maintains a pool of unconfirmed transactions
(aka the *mempool*). Thus, transactions created by the oracle service
during the [`handle_commit`][Service.handle_commit] execution
will be stored in `TestKit` memory pool and can be verified accordingly.

```rust
// Create testkit with the service which creates transaction
// with the height of the latest committed block after commit.
let mut testkit = TestKitBuilder::validator()
    .with_service(HandleCommitService)
    .create();

// Call the `handle_commit` event.
testkit.create_block();

// Check that `handle_commit` has been invoked
// at the correct height.
let tx = TxAfterCommit::new_with_signature(
    Height(1),
    &Signature::zero(),
);
assert!(testkit.mempool().contains_key(&tx.hash()));
```

!!! tip
    In order to invoke a `handle_commit` event, you need to create a block
    with one of the `create_block*` methods of the testkit.

If the oracle has to fetch any data from external world, you need to create
a mock object that would generate said external data to accomplish testing.

```rust
// Provide a mock object for the service.
let mut cruel_world = ExternalApiMock::new();
let mut testkit = TestKitBuilder::validator()
    .with_service(
        MyOracleService::with_client(cruel_world.client()),
    )
    .create();

// Expect a request from the service.
cruel_world.expect_api_call(ApiCallInfo { ... })
    .with_response_ok(ApiResponse { ... });

// Call the `handle_commit` event.
testkit.create_block();
let expected_tx = MyOracleTx::new(...);

// Check that the expected transaction is in the memory pool.
assert!(testkit.mempool().contains_key(&expected_tx.hash()));
```

### Configuration Changes Testing

If an Exonum service has its own [configuration][service-config],
you may need to test the response to a configuration change.
To do this with the testkit, you can create a configuration change proposal
and then commit it.

```rust
let mut testkit = TestKitBuilder::validator()
    .with_service(MyOracleService::new())
    .create();

// Create a configuration change proposal.
let proposal = {
    let mut cfg = testkit.configuration_change_proposal();
    cfg.set_actual_from(cfg_change_height);
    cfg.set_service_config(
        "my_service",
        MyServiceCfg { ... },
    );
    cfg
};
let stored = proposal.stored_configuration().clone();
testkit.commit_configuration_change(proposal);

// Check that there is no following configuration scheduled
// before a block is created, and the proposal is committed.
use exonum::blockchain::Schema;
assert_eq!(
    Schema::new(&testkit.snapshot())
        .following_configuration(),
    None
);
testkit.create_block();
// Check that the following configuration is now scheduled.
assert_eq!(
    Schema::new(&testkit.snapshot())
        .following_configuration(),
    Some(stored)
);
```

[exonum-testkit]: https://crates.io/crates/exonum-testkit
[dev-dep]: http://doc.crates.io/specifying-dependencies.html#development-dependencies
[Transaction.execute]: ../architecture/transactions.md#execute
[integration-tests]: https://doc.rust-lang.org/book/second-edition/ch11-03-test-organization.html#integration-tests
[exonum-btc-anchoring]: https://github.com/exonum/exonum-btc-anchoring
[Service.handle_commit]: ../architecture/services.md#commit-handler
[service-config]: ../architecture/services.md#configuration
