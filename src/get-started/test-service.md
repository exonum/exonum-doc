---
title: Service testing tutorial
---
# Service Testing Tutorial

As blockchain technology is focused on security, a natural desire after
[creating an Exonum service](create-service.md) is to test it. This tutorial
shows how to accomplish this task with the help of
[the testkit library](../advanced/service-testing.md).

!!! tip
    This document describes testing of Rust services. For Java instructions,
    please refer to the [documentation][java-testkit].

## Preparing for Testing

Recall that an Exonum service is typically packaged as a Rust crate.
Correspondingly,
service testing could be performed with the help
of [integration tests][cargo-testing],
in which the service is treated like a black or gray box. In the case of
the cryptocurrency service, which we created in the previous tutorial, it
would be natural to test
how the service reacts to overcharges, transfers from or to the unknown
wallet, transfers to self, and other scenarios which may work not as
expected.

Exonum has a handy tool in its disposal to test services in this manner –
the [**exonum-testkit**](../advanced/service-testing.md) crate. To use it,
we need to add the following lines to the project’s `Cargo.toml`:

```toml
[dev-dependencies]
exonum-testkit = "1.0.0-rc.1"
```

## Testing Kinds

There are two major kinds of testing enabled by **exonum-testkit**:

- [Transaction logic testing](#testing-transaction-logic) treats the service
  as a *gray* box. It uses the service schema to read information from
  the storage, and executes transactions by sending them directly to the Rust
  API of the testkit. This allows for fine-grained testing focused on business
  logic of the service.
- [API testing](#testing-api) treats the service as a *black* box, using
  its HTTP APIs to process transactions and read requests. A good idea
  is to use this kind of testing to verify the API-specific code.

In both cases, tests generally follow the same pattern:

- Initialize the testkit
- Introduce changes to the blockchain via transactions
- Use the service schema or read requests to check that the changes are as
  expected

We cover both kinds of testing in separate sections below.

## Testing Transaction Logic

Let’s create [`src/tx_tests.rs`][tests-tx_logic.rs], a file which will
contain the tests for transaction business logic. Since we have defined
service schema as crate-private, we need to place the testing module within
the service crate, rather than as an [integration test].

### Imports

We need to import the types we will use:

```rust
use exonum::{
    crypto::{KeyPair, PublicKey},
    runtime::SnapshotExt,
};
use exonum_merkledb::{access::Access, Snapshot};
use exonum_testkit::TestKit;

// Import data types used in tests from the crate where the service is defined.
use crate::{
    contracts::{CryptocurrencyInterface, CryptocurrencyService},
    schema::{CurrencySchema, Wallet},
    transactions::{CreateWallet, TxTransfer},
};
```

### Declaring Constants

We also need to declare some constants we will use later:

```rust
// Alice's wallets name.
const ALICE_NAME: &str = "Alice";
// Bob's wallet name.
const BOB_NAME: &str = "Bob";
// Service instance id.
const INSTANCE_ID: u32 = 1010;
// Service instance name.
const INSTANCE_NAME: &str = "nnm-token";
```

### Creating Test Network

To perform testing, we first need to create a network emulation – the eponymous
`TestKit`. `TestKit` allows recreating behavior of a single full node
(a validator or an auditor) in an imaginary Exonum blockchain network.

!!! note
    Unlike real Exonum nodes, the testkit does not actually start servers
    in order to process requests from external clients.
    Instead, transactions and read requests are processed synchronously,
    in the same process as the test code itself.

Since `TestKit` will be used by all tests, it is natural to move its
constructor to a separate function:

```rust
fn init_testkit() -> TestKit {
    TestKit::for_rust_service(
        CryptocurrencyService, // service instance
        INSTANCE_NAME, // name of the instance
        INSTANCE_ID, // numerical ID of the instance
        (), // Initialization arguments (none)
    )
}
```

That is, we create a network emulation, in which there is a single validator
node, and a single `CurrencyService`. `TestKit` supports
testing several services at once, as well as more complex network
configurations, but this functionality is not needed in our case.

### Other Helper Functions

We need a way to obtain [the service schema](create-service.md#create-schema)
from the testkit. The testkit allows to obtain a snapshot of the blockchain
state, using which we construct the schema:

```rust
fn get_schema<'a>(
    snapshot: &'a dyn Snapshot,
) -> CurrencySchema<impl Access + 'a> {
    CurrencySchema::new(snapshot.for_service(INSTANCE_NAME).unwrap())
}
```

Here, `for_service` method of the `SnapshotExt` extension trait
provides access to the data of a specific service. Since we do not care
about the exact access type, we use generic `impl Access + 'a` as the
type parameter of the resulting schema.

!!! note
    Use of lifetime `'a` indicates that the access type cannot outlive
    the snapshot it is created from.

Finally, we define getters to obtain wallet info from the blockchain
state:

```rust
/// Returns the wallet identified by the given public key
/// or `None` if such a wallet doesn't exist.
fn try_get_wallet(
    testkit: &TestKit,
    pubkey: &PublicKey,
) -> Option<Wallet> {
    let snapshot = testkit.snapshot();
    let schema = get_schema(&snapshot);
    schema.wallets.get(pubkey)
}

/// Returns the wallet identified by the given public key.
fn get_wallet(testkit: &TestKit, pubkey: &PublicKey) -> Wallet {
    try_get_wallet(testkit, pubkey).expect("No wallet persisted")
}
```

### Wallet Creation

> **Test:** `test_create_wallet`

Our first test is very simple: we want to create a single wallet with the help
of the corresponding transaction and make sure that the wallet is actually
persisted by the blockchain.

```rust
#[test]
fn test_create_wallet() {
    let mut testkit = init_testkit();
    let keypair = KeyPair::random();
    let tx = keypair.create_wallet(INSTANCE_ID, CreateWallet::new(ALICE_NAME));
    testkit.create_block_with_transaction(tx.clone());

    // Check that the user indeed is persisted by the service
    let wallet = get_wallet(&testkit, &tx.author());
    assert_eq!(wallet.pub_key, tx.author());
    assert_eq!(wallet.name, ALICE_NAME);
    assert_eq!(wallet.balance, 100);
}
```

Per Rust conventions, the test is implemented as a zero-argument function
without a returned value and
with a `#[test]` annotation. This function will be invoked during testing;
if it does not panic, the test is considered passed.

We use one of `create_block*` methods defined by `TestKit` to send a
transaction to the testkit node and create a block with it (and only it).
Then, we use the service schema to check that the transaction has led to
the expected changes in the storage.

Note that we call `create_wallet` method
of the [service interface](create-service.md#service-interface) directly
on a generated `keypair`. This is enabled by the glue code
generated by the `exonum_interface` proc macro; it effectively implements
the interface for some *stub* types, including `KeyPair`. As a result
of applying the method to the keypair, we get a transaction with the
specified contents signed by the keypair.

To run the test, execute `cargo test` in the shell:

```none
$ cargo test
# (Some output skipped)
running 1 test
test test_create_wallet ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

If we remove or comment out the `create_block*` call, the test
will expectedly fail because the wallet is no longer created:

```none
running 1 test
test test_create_wallet ... FAILED

failures:

---- test_create_wallet stdout ----
  thread 'test_create_wallet' panicked at 'No wallet persisted'
```

### Successful Transfer

> **Test:** `test_transfer`

Let’s test a transfer between two wallets. To do this, first, we need
to initialize the `TestKit`. Then we need to create the wallets and
transfer funds between them. As per the code of the
Cryptocurrency Service, the wallets are created with the initial
balance set to `100`.

The mentioned three transactions will be included into the block:

```rust
let mut testkit = init_testkit();
let alice = KeyPair::random();
let bob = KeyPair::random();
testkit.create_block_with_transactions(vec![
    alice.create_wallet(INSTANCE_ID, CreateWallet::new(ALICE_NAME)),
    bob.create_wallet(INSTANCE_ID, CreateWallet::new(BOB_NAME)),
    alice.transfer(
        INSTANCE_ID,
        TxTransfer {
            amount: 10,
            seed: 0,
            to: bob.public_key(),
        },
    ),
]);
```

Check that wallets are committed to the blockchain and have expected balances:

```rust
let alice_wallet = get_wallet(&testkit, &alice.public_key());
assert_eq!(alice_wallet.balance, 90);
let bob_wallet = get_wallet(&testkit, &bob.public_key());
assert_eq!(bob_wallet.balance, 110);
```

### Transfer to Non-Existing Wallet

> **Test:** `test_transfer_to_nonexisting_wallet`

Unlike in a real Exonum network, you can control which transactions the testkit
will include into the next block. This allows testing different orderings
of transactions, even those that would be hard (but not impossible) to
reproduce in a real network.

Let’s test the case when Alice sends a transaction to Bob while Bob’s wallet
is not committed. The test is quite similar to the previous one, with the
exception of how the created transactions are placed into the block.
Namely, the `create_block_with_transactions` call is replaced with

```rust
let mut testkit = init_testkit();
let alice = KeyPair::random();
let bob = KeyPair::random();
testkit.create_block_with_transactions(vec![
    alice.create_wallet(INSTANCE_ID, CreateWallet::new(ALICE_NAME)),
    alice.transfer(
        INSTANCE_ID,
        TxTransfer {
            amount: 10,
            seed: 0,
            to: bob.public_key(),
        },
    ),
    bob.create_wallet(INSTANCE_ID, CreateWallet::new(BOB_NAME)),
]);
```

That is, although Bob’s wallet is created, this occurs after the transfer is
executed.

We then check that Alice did not send her tokens to nowhere:

```rust
let alice_wallet = get_wallet(&testkit, &alice.public_key());
assert_eq!(alice_wallet.balance, 100);
let bob_wallet = get_wallet(&testkit, &bob.public_key());
assert_eq!(bob_wallet.balance, 100);
```

## Testing API

API-focused tests are placed in a separate file, [`tests/api.rs`][tests-api.rs].
It is structurally similar to the transaction testing module
we have considered previously (including tests),
so we will concentrate on differences only.

### Setup

Exonum provides a standalone component to submit transactions
to the blockchain via HTTP:
the [explorer service](../advanced/other-services.md#explorer).
To add it to the testkit, we need to declare the corresponding
crate (`exonum-explorer-service`) as a dev dependency of our crate,
and use the following logic to initialize the testkit:

> **Method:** `create_testkit`

```rust
let artifact = CryptocurrencyService.artifact_id();
let mut testkit = TestKitBuilder::validator()
    // Add the explorer service to the testkit
    .with_default_rust_service(ExplorerFactory)
    // Add the tested service
    .with_rust_service(CryptocurrencyService)
    .with_artifact(artifact.clone())
    .with_instance(
        artifact.into_default_instance(INSTANCE_ID, INSTANCE_NAME)
    )
    .build();
```

### API Wrapper

The testkit allows accessing service endpoints with the help
of the [`TestKitApi`][TestKitApi] struct. However, calls to `TestKitApi`
may be overly verbose and prone to errors for practical purposes,
as the struct does not know the type signatures of the endpoints
of a specific service. To improve usability,
let’s create a *wrapper* around `TestKitApi` with the wrapper’s methods
corresponding to service endpoints:

```rust
struct CryptocurrencyApi {
    pub inner: TestKitApi,
}

impl CryptocurrencyApi {
    fn create_wallet(&self, name: &str) -> (Verified<AnyTx>, KeyPair) {
        // Code skipped...
    }

    fn transfer(&self, tx: &Verified<AnyTx>) {
        // Code skipped...
    }

    fn get_wallet(&self, pub_key: PublicKey) -> Wallet {
        // Code skipped...
    }
}
```

`create_wallet` returns a keypair along with the created transaction
because it may be needed to sign other transactions authorized by the wallet
owner.

Inside, all wrapper methods invoke methods of the `inner` API instance;
for example, `get_wallet` is implemented as:

```rust
fn get_wallet(&self, pub_key: PublicKey) -> Wallet {
    self.inner
        .public(ApiKind::Service(INSTANCE_NAME))
        .query(&WalletQuery { pub_key })
        .get("v1/wallet")
        .unwrap()
}
```

That is, the method performs an HTTP GET request with the URL address
corresponding to a service with the specified name and a `v1/wallet`
path within the service API. When we created the service,
we [defined](create-service.md#wire-api) that invoking such a request
would return information about a specific wallet.

Out of the three methods, only the `get_wallet` method uses the HTTP API
of the cryptocurrency service. Both `create_wallet` and `transfer`
use the `transactions` endpoint of the previously mentioned explorer service:

```rust
fn transfer(&self, tx: &Verified<AnyTx>) {
    let tx_info: serde_json::Value = self
        .inner
        .public(ApiKind::Explorer) // Not `ApiKind::Service(_)`!
        .query(&json!({ "tx_body": tx }))
        .post("v1/transactions")
        .unwrap();
    assert_eq!(tx_info, json!({ "tx_hash": tx.object_hash() }));
}
```

### Waiting for Errors

`CryptocurrencyApi` has a separate method to assert that there is no wallet
with a specified public key:

```rust
fn assert_no_wallet(&self, pub_key: PublicKey) {
    let err = self
        .inner
        .public(ApiKind::Service(INSTANCE_NAME))
        .query(&WalletQuery { pub_key })
        .get::<Wallet>("v1/wallet")
        .unwrap_err();

    assert_eq!(err.http_code, api::HttpStatusCode::NOT_FOUND);
    assert_eq!(err.body.title, "Wallet not found");
    assert_eq!(
        err.body.source,
        format!("{}:{}", INSTANCE_ID, INSTANCE_NAME)
    );
}
```

Note that this method uses the `unwrap_err` method instead of
`unwrap`. While `unwrap` will panic if the returned value is
erroneous, `unwrap_err` acts in the opposite way, panicking if
the response does not contain an error.

Errors returned by Rust services conform to the data format
defined in [RFC 7807]. This is reflected in the internal structure
of `err`; it consists of an HTTP code and a body decoded from JSON
according to the schema defined in the RFC.

### Creating Blocks

While it is possible to send transactions via HTTP API, they are not
automatically committed to the blockchain; they are only put to the pool of
candidates for inclusion into future blocks. To fully process transactions,
one needs to use `create_block*` methods, which we have used in the business
logic tests.

As an example, the `test_create_wallet` variation for HTTP API testing is
as follows:

```rust
let (mut testkit, api) = create_testkit();
// Create and send a transaction via API
let (tx, _) = api.create_wallet(ALICE_NAME);
testkit.create_block();
api.assert_tx_status(tx.object_hash(), &json!({ "type": "success" }));

// Check that the user indeed is persisted by the service.
let wallet = api.get_wallet(tx.author());
assert_eq!(wallet.pub_key, tx.author());
assert_eq!(wallet.name, ALICE_NAME);
assert_eq!(wallet.balance, 100);
```

Note that we call `create_block` after sending a transaction via HTTP API.
The `create_block` method creates a block with all uncommitted transactions,
which is just what we need.

For an example of more fine-grained control, consider the test for transferring
tokens from a non-existing wallet:

> **Test:** `test_transfer_from_nonexisting_wallet`

```rust
let (mut testkit, api) = create_testkit();
let (tx_alice, alice) = api.create_wallet(ALICE_NAME);
let (tx_bob, _) = api.create_wallet(BOB_NAME);
// Do not commit Alice's transaction, so Alice's wallet does not exist
// when a transfer occurs.
testkit.create_block_with_tx_hashes(&[tx_bob.object_hash()]);
api.assert_no_wallet(tx_alice.author());
```

This code results in the testkit not committing Alice’s transaction,
so Alice’s wallet does not exist when the transfer occurs later.

Exonum framework retains helpful information about the possible error cause,
such the human-readable error description, a service-specific code
and the identifier of the service / method in which the error has occurred:

```rust
let tx = alice.transfer(
    INSTANCE_ID,
    TxTransfer {
        to: tx_bob.author(),
        amount: 10,
        seed: 0,
    },
);

api.transfer(&tx);
testkit.create_block_with_tx_hashes(&[tx.object_hash()]);
api.assert_tx_status(
    tx.object_hash(),
    &json!({
        "type": "service_error",
        "code": 1,
        // Description shortened for readability
        "description": "Sender doesn\'t exist.",
        "runtime_id": 0,
        "call_site": {
            "call_type": "method",
            "instance_id": INSTANCE_ID,
            "method_id": 1,
        },
    }),
);
```

In the code above, `assert_tx_status` method uses an endpoint
of the explorer service to get the execution status for a transaction
specified by its hash.

## Conclusion

Testing is arguably just as important in software development as coding,
especially in typical blockchain applications. The testkit framework allows
streamlining the testing process for Exonum services and testing both business
logic and HTTP API.

[cargo-testing]: https://doc.rust-lang.org/cargo/reference/manifest.html#tests
[integration test]: https://doc.rust-lang.org/cargo/reference/manifest.html#integration-tests
[java-testkit]: ../get-started/java-binding.md#testing
[tests-tx_logic.rs]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/src/tx_tests.rs
[tests-api.rs]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/tests/api.rs
[TestKitApi]: https://docs.rs/exonum-testkit/0.10.2/exonum_testkit/struct.TestKitApi.html
[TestKit-snapshot]: https://docs.rs/exonum-testkit/0.10.2/exonum_testkit/struct.TestKit.html#method.snapshot
[RFC 7807]: https://tools.ietf.org/html/rfc7807
