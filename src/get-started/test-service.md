---
title: Service testing tutorial
---
# Service Testing Tutorial

!!! note
    TestKit is also available in Java language.  
    Please refer to the [documentation][java-testkit] for details.

As blockchain technology is focused on security, a natural desire after
[creating an Exonum service](create-service.md) is to test it. This tutorial
shows how to accomplish this task with the help of
[the testkit library](../advanced/service-testing.md).

## Preparing for Integration Testing

Recall that an Exonum service is typically packaged as a Rust crate.
Correspondingly,
service testing could be performed with the help
of [integration tests][integration-testing],
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
assert_matches = "1.3.0"
exonum-testkit = "0.10.2"
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

In both cases tests generally follow the same pattern:

- Initialize the testkit
- Introduce changes to the blockchain via transactions
- Use the service schema or read requests to check that the changes are as
  expected

We cover both kinds of testing in separate sections below.

## Testing Transaction Logic

Let’s create [`tests/tx_logic.rs`][tests-tx_logic.rs], a file which will
contain the tests for transaction business logic.

### Imports

We need to import the types we will use:

```rust
use assert_matches::assert_matches;
use exonum::{
    api::Error,
    crypto::{gen_keypair, PublicKey, SecretKey},
    messages::{to_hex_string, RawTransaction, Signed},
};
use exonum_testkit::{txvec, ApiKind, TestKit, TestKitApi, TestKitBuilder};
use serde_json::json;
// Imports datatypes from the crate where the service is defined.
use exonum_cryptocurrency::{
    schema::{CurrencySchema, Wallet, WalletQuery},
    service::CurrencyService,
    transactions::{TxCreateWallet, TxTransfer},
};
```

### Creating Test Network

To perform testing, we first need to create a network emulation – the eponymous
`TestKit`. `TestKit` allows recreating behavior of a single full node
(a validator or an auditor) in an imaginary Exonum blockchain network.

!!! note
    Unlike real Exonum nodes, the testkit does not actually start a web server
    in order to process requests from external clients.
    Instead, transactions and read requests are processed synchronously,
    in the same process as the test code itself. For example, once
    a new block is created with a `TxCreateWallet` transaction, it is
    executed
    [as defined by the service](create-service.md#transaction-execution).

Since `TestKit` will be used by all tests, it is natural to move its
constructor to a separate function:

```rust
fn init_testkit() -> TestKit {
    TestKitBuilder::validator()
        .with_service(CurrencyService)
        .create()
}
```

That is, we create a network emulation, in which there is a single validator
node, and a single `CurrencyService`. `TestKit` supports
testing several services at once, as well as more complex network
configurations, but this functionality is not needed in our case.

### Wallet Creation

> **Test:** `test_create_wallet`

Our first test is very simple: we want to create a single wallet with the help
of the corresponding API call and make sure that the wallet is actually
persisted by the blockchain.

```rust
#[test]
fn test_create_wallet() {
    let mut testkit = init_testkit();
    let (pub_key, sec_key) = gen_keypair();
    testkit.create_block_with_transactions(txvec![
        TxCreateWallet::sign("Alice", &pub_key, &sec_key),
    ]);
    let snapshot = testkit.snapshot();
    let wallet = CurrencySchema::new(snapshot)
        .wallet(&pub_key)
        .expect("No wallet");

    assert_eq!(wallet.pub_key, pub_key);
    assert_eq!(wallet.name, "Alice");
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
to initialize the testkit. Then we need to create the wallets and
transfer funds between them. As per the code of the
Cryptocurrency Service, the wallets are created with the initial
balance set to `100`.

The mentioned three transactions will be included into the block:

```rust
let mut testkit = init_testkit();
let (alice_pubkey, alice_key) = gen_keypair();
let (bob_pubkey, bob_key) = gen_keypair();
testkit.create_block_with_transactions(txvec![
    TxCreateWallet::sign("Alice", &alice_pubkey, &alice_key),
    TxCreateWallet::sign("Bob", &bob_pubkey, &bob_key),
    TxTransfer::sign(
        &bob_pubkey,    // receiver
        10,             // amount
        0,              // seed
        &alice_pubkey,  // sender
        &alice_key,     // private key used to sign the transaction
    ),
]);
```

Check that wallets are committed to the blockchain and have expected balances:

```rust
let wallets = {
    let snapshot = testkit.snapshot();
    let schema = CurrencySchema::new(&snapshot);
    (schema.wallet(&alice_pubkey), schema.wallet(&bob_pubkey))
};

if let (Some(alice_wallet), Some(bob_wallet)) = wallets {
    assert_eq!(alice_wallet.balance, 90);
    assert_eq!(bob_wallet.balance, 110);
} else {
    panic!("Wallets not persisted");
}
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
testkit.create_block_with_transactions(txvec![
    TxCreateWallet::sign("Alice", &alice_pubkey, &alice_key),
    TxTransfer::sign(&bob_pubkey, 10, 0, &alice_pubkey, &alice_key),
    TxCreateWallet::sign("Bob", &bob_pubkey, &bob_key),
]);
```

That is, although Bob's wallet is created, this occurs after the transfer is
executed.

We should check that Alice did not send her tokens to nowhere:

```rust
assert_eq!(alice_wallet.balance, 100);
assert_eq!(bob_wallet.balance, 100);
```

## Testing API

API-focused tests are placed in a separate file,
[`tests/api.rs`][tests-api.rs].
It is structurally similar to the integration test file we have considered
previously (including tests), so we will concentrate on differences only.

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
    inner: TestKitApi,
}

impl CryptocurrencyApi {
    fn create_wallet(&self, name: &str) -> (Signed<RawTransaction>, SecretKey) {
        // Code skipped...
    }

    fn transfer(&self, tx: &Signed<RawTransaction>) {
        // Code skipped...
    }

    fn get_wallet(&self, pub_key: PublicKey) -> Wallet {
        // Code skipped...
    }
}
```

`create_wallet` returns a secret key along with the created transaction
because it may be needed to sign other transactions authorized by the wallet
owner.

Inside, all wrapper methods call the `inner` API instance; for example,
`get_wallet` is implemented as:

```rust
fn get_wallet(&self, pub_key: PublicKey) -> Wallet {
    self.inner
        .public(ApiKind::Service("cryptocurrency"))
        .query(&WalletQuery { pub_key })
        .get("v1/wallet")
        .unwrap()
}
```

That is, the method performs an HTTP GET request with the URL address
corresponding to a service
[with the specified name](../architecture/services.md#service-identifiers)
and a `v1/wallet/…` path within the service API. When we created the service,
we [defined](create-service.md#wire-api) that invoking such a request
would return information about a specific wallet.

### Waiting for Errors

`CryptocurrencyApi` has a separate method to assert that there is no wallet
with a specified public key:

```rust
fn assert_no_wallet(&self, pub_key: PublicKey) {
    let err = self
        .inner
        .public(ApiKind::Service("cryptocurrency"))
        .query(&WalletQuery { pub_key })
        .get::<Wallet>("v1/wallet")
        .unwrap_err();

    assert_matches!(err, Error::NotFound(ref body) if body == "Wallet not found");
}
```

Note that this method uses the `TestKitApi::get_err` method instead of
`TestKitApi::get`. While `get` will panic if the returned response is erroneous
(that is, has non-20x HTTP status), `get_err` acts in the opposite way,
panicking if the response *does not* have a 40x status.

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
let (tx, _) = api.create_wallet("Alice");
testkit.create_block();
let wallet = api.get_wallet(tx.author());
assert_eq!(wallet.pub_key, tx.author());
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
let (tx_alice, key_alice) = api.create_wallet("Alice");
let (tx_bob, _) = api.create_wallet("Bob");
testkit.create_block_with_tx_hashes(&[tx_bob.hash()]);
api.assert_no_wallet(tx_alice.author());
```

This code results in the testkit not committing Alice’s transaction,
so Alice’s wallet does not exist when the transfer occurs later.

## Conclusion

Testing is arguably just as important in software development as coding,
especially in typical blockchain applications. The testkit framework allows
streamlining the testing process for Exonum services and testing both business
logic and HTTP API.

[integration-testing]: https://doc.rust-lang.org/cargo/reference/manifest.html#integration-tests
[java-testkit]: /java-binding.md#testing
[tests-tx_logic.rs]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/tests/tx_logic.rs
[tests-api.rs]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency/tests/api.rs
[TestKitApi]: https://docs.rs/exonum-testkit/0.10.2/exonum_testkit/struct.TestKitApi.html
[TestKit-snapshot]: https://docs.rs/exonum-testkit/0.10.2/exonum_testkit/struct.TestKit.html#method.snapshot
