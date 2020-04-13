# Service Testing

You can test Exonum services with the help of the Exonum TestKit. It allows to
test transaction execution and APIs in the synchronous environment (that is,
without consensus algorithm and network operation involved). Tests are executed
in the same system process as the service code itself, allowing to more easily
debug service business logic (for example, panics).

This document describes testing of Rust services with
[**exonum-testkit**][exonum-testkit] crate. For Java instructions please refer
to the [documentation][java-testkit].

## Installation

In most cases you want to install `exonum-testkit` as a [development dependency][dev-dep],
so it would be compiled for tests only. For this, add the dependency
to the `dev-dependencies` section of the `Cargo.toml` file of your project:

```toml
[dev-dependencies]
exonum-testkit = "1.0.0"
```

!!! note
    The newest version of the testkit crate may differ from the one specified above.
    To find out the newest version, you may look at [the repository page on crates.io][exonum-testkit].
    Beware that different versions of testkit are compatible with different
    versions of the core library.

## Simple usage

### Transactions testing

The primary goal of this kind of tests is to check the business logic of your service,
encapsulated in the transaction handlers.

Suppose the service interface is defined in the crate `my-service` as

```rust
/// Transaction payload.
pub struct MyTransaction { /* ... */ }

/// Service interface.
#[exonum_interface]
pub trait MyInterface<Ctx> {
    type Output;
    fn do_something(&self, context: Ctx, arg: MyTransaction) -> Self::Output;
}

/// Service implementation.
#[derive(ServiceFactory, ServiceDispatcher)]
#[service_dispatcher(implements("MyInterface"))]
pub struct MyService;
// Actual implementation skipped for brevity.
```

For writing your first test create `tests` directory according to the cargo
[integration testing manual][integration-tests].
After that, create file `tests/transactions.rs` with the content similar
to the one written below.

```rust
use my_service::{MyService, MyInterface, MyTransaction, MySchema};
use exonum::crypto::gen_keypair;
use exonum_testkit::TestKitBuilder;

const SERVICE_ID: u32 = 100;

#[test]
fn my_transaction_works() {
    // Create simple testkit network.
    let service_instance = MyService
        .arifact_id()
        .into_default_instance(SERVICE_ID, "my-service");
    let mut testkit = TestKitBuilder::validator()
        .with_artifact(MyService.arifact_id())
        .with_rust_service(MyService)
        .with_instance(service_instance)
        .create();
    // Create transaction.
    let payload = MyTransaction::new(/* ... */);
    // Generate a random keypair to sign the transaction.
    let keypair = gen_keypair();
    // Get a signed transaction.
    let tx = keypair.do_something(SERVICE_ID, payload);
    // Commit it into blockchain.
    let block = testkit.create_block_with_transaction(tx);
    // Check that the transaction executed successfully.
    block[0].status().unwrap();
    // Check the expected result.
    let snapshot = testkit.snapshot();
    let schema = MySchema::new(&snapshot);
    assert!(schema.is_my_data_checked());
}
```

Make sure that you have full coverage of the business logic in the `execute` method
of your transactions.

Testkit also allows to check different orderings of transactions, including transactions
for multiple services. This could allow to more efficiently test margin cases
that are quite difficult (but not impossible) to produce in the real network.

```rust
// Create transactions.
let keypair = gen_keypair();
let tx1 = keypair.do_one_thing(MyTransaction::new(/* ... */));
let tx2 = keypair.do_other_thing(OtherTransaction::new(/* ... */));
// Commit them into the blockchain.
testkit.create_block_with_transactions(vec![tx1, tx2]);
// Check the expected result.
```

### API testing

The basic workflow for testing API endpoints of an Exonum service
with the testkit is as follows:

1. Define the `MyServiceApi` trait for the `TestKitApi` structure that covers
  the whole API of your service.
2. Implement functions that use some transactions as test data to fill the storage.
3. Create the tests that check all of your endpoints.

??? note "Workflow example"
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
            self.public(ApiKind::Service("my_service"))
                .get("/v1/first_endpoint")
                .unwrap()
        }

        fn get_private_data(&self) -> PrivateDataResponse {
            self.private(ApiKind::Service("my_service"))
                .get("/v1/second_endpoint")
                .unwrap()
        }

        fn post_private_data(&self, query: &PrivateDataQuery)
            -> PostPrivateDataResponse
        {
            self.private(ApiKind::Service("my_service"))
                .query(query)
                .post("v1/third_endpoint")
                .unwrap()
        }
    }

    #[test]
    fn my_api_test() {
        let mut testkit = TestKitBuilder::validator()
            .with_service(MyService)
            .create();
        fill_storage_with_data(&mut testkit);
        // Check API responses
        let api = testkit.api();
        assert_eq!(
            api.get_public_data(),
            ApiResponsePublicData::new(/* ... */),
        );
        ...
    }
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
during the `after_commit` execution will be stored in `TestKit` memory pool
and can be verified accordingly.

```rust
// Assume that we have a service which creates transaction
// with the height of the latest committed block after commit:
#[exonum_interface]
pub trait HandleCommitInterface<Ctx> {
    type Output;

    fn report_commit(&self, context: Ctx, height: Height)
        -> Self::Output;
}

#[derive(ServiceFactory, ServiceDispatcher)]
#[service_dispatcher(implements("HandleCommitInterface"))]
pub struct HandleCommitService;
// `Service` implementation skipped...

// Create testkit with the service.
let mut testkit = TestKitBuilder::validator()
    .with_default_rust_service(HandleCommitService)
    .create();

// Call the `after_commit` event.
testkit.create_block();

// Check that `after_commit` has been invoked
// at the correct height.
let payload = Height(1);
let id = HandleCommitService::INSTANCE_ID;
let tx = testkit.us().service_keys().report_commit(id, payload);
assert!(testkit.is_tx_in_pool(&tx.object_hash()));
```

!!! tip
    In order to invoke a `after_commit` hook, you need to create a block
    with one of the `create_block*` methods of the testkit.

If the oracle has to fetch any data from external world, you need to create
a mock object that would generate said external data to accomplish testing.

```rust
// Provide a mock object for the service.
let mut cruel_world = ExternalApiMock::new();
let service_factory =
    MyOracleService::with_client(cruel_world.client());
let mut testkit = TestKitBuilder::validator()
    .with_default_rust_service(service_factory)
    .create();

// Expect a request from the service.
cruel_world
    .expect_api_call(ApiCallInfo { /* ... */ })
    .with_ok_response(ApiResponse { /* ... */ });

// Call the `after_commit` hook.
testkit.create_block();
let payload = MyOracleTx::new(/* ... */);
let expected_tx = testkit
    .us()
    .service_keys()
    .report_something(MyOracleService::INSTANCE_ID, payload);

// Check that the expected transaction is in the memory pool.
assert!(testkit.is_tx_in_pool(&expected_tx.object_hash()));
```

### Testing Lifecycle Events

If an Exonum service has its own configuration,
which is updated through the [supervisor],
you may want to test the response to a configuration change.
To do this with the testkit, you can include the supervisor
service with a centralized setup and perform configuration changes
by generating supervisor transactions (in this case, a transaction
to update the config of the service under test).

By analogy, you may test service instantiation / resuming logic.

### Testing Data Migrations

The testkit crate provides a separate framework for testing
data migrations; it is placed in the `migrations` module of the crate.
Using this framework, you can set up initial data for the service,
execute one or more migration scripts and ensure that the migration
outcome is as expected. (That is, data is transformed as designed,
outdated indexes are removed, new indexes are added, etc.)
Additionally, you can test that your migration
scripts are [fault-tolerant], that is, properly process aborts.

[exonum-testkit]: https://crates.io/crates/exonum-testkit
[dev-dep]: http://doc.crates.io/specifying-dependencies.html#development-dependencies
[java-testkit]: ../get-started/java-binding.md#testing
[integration-tests]: https://doc.rust-lang.org/book/second-edition/ch11-03-test-organization.html#integration-tests
[exonum-btc-anchoring]: https://github.com/exonum/exonum-btc-anchoring
[supervisor]: supervisor.md
[fault-tolerant]: ../architecture/services.md#fault-tolerance-in-migration-scripts
