---
title: Service testing tutorial
---
# Service Testing Tutorial

As blockchain technology is focused on security, a natural desire after
[creating an Exonum service](create-service.md) is to test it. This tutorial
shows how to accomplish this task with the help of [the testkit library](../advanced/service-testing.md).

## Preparing for Integration Testing

Recall that an Exonum service is typically packaged as a Rust crate. Correspondingly,
service testing could naturally be performed with the help of [integration tests][integration-testing],
in which the service is treated like a black box. In the case of the cryptocurrency
service, which we created in the previous tutorial, it would be natural to test
how the service reacts to overcharges, transfers from or to the unknown wallet,
transfers to self, and other scenarios which may work not as expected.

Exonum has a handy tool in its disposal to test services in this manner –
the [**exonum-testkit**](../advanced/service-testing.md) crate. To use it,
we need to add the following lines to the project’s `Cargo.toml`:

```toml
[dev-dependencies]
exonum-testkit = "0.1.0"
```

Then, let’s create [`tests/api.rs`][tests-api.rs], a file which will
contain the tests.

## Imports

The created file is executed separately from the service code, meaning that we
need to import the service crate along with **exonum** and **exonum-testkit**:

```rust
extern crate cryptocurrency;
extern crate exonum;
extern crate exonum_testkit;
```

Just like with the service itself, we then import types we will use:

```rust
use exonum::crypto::{self, PublicKey, SecretKey};
use exonum::messages::Message;
use exonum_testkit::{ApiKind, TestKit, TestKitApi, TestKitBuilder};

// Import datatypes used in tests from the crate where the service is defined.
use cryptocurrency::{TxCreateWallet, TxTransfer, TransactionResponse,
                     Wallet, CurrencyService};
```

## API Wrapper

The testkit allows to access service endpoints with the help
of the [`TestKitApi`][TestKitApi] struct. However, calls to `TestKitApi`
may be overly verbose and prone to errors for practical purposes,
as the struct does not know type signatures of the endpoints
of a specific service. To improve usability,
let’s create a *wrapper* around `TestKitApi` with the wrapper’s methods corresponding
to service endpoints:

```rust
struct CryptocurrencyApi {
    inner: TestKitApi,
}

impl CryptocurrencyApi {
    fn create_wallet(&self, name: &str) -> (TxCreateWallet, SecretKey) {
        // Code skipped...
    }

    fn transfer(&self, tx: &TxTransfer) {
        // Code skipped...
    }

    fn get_wallet(&self, pubkey: &PublicKey) -> Wallet {
        // Code skipped...
    }
}
```

Inside, all these methods call the `inner` API instance; for example, `get_wallet`
is implemented as

```rust
fn get_wallet(&self, pubkey: &PublicKey) -> Wallet {
    self.inner.get(
        ApiKind::Service("cryptocurrency"),
        &format!("v1/wallet/{}", pubkey.to_string()),
    )
}
```

That is, the method performs an HTTP GET request with the URL address corresponding
to a service [with the specified name](../architecture/services.md#service-identifiers)
and a `v1/wallet/…` path within the service API. When we created the service,
we [have defined](create-service.md#wire-api) that invoking such a request
returns information about a specific wallet.

### Waiting for Errors

`CryptocurrencyApi` has a separate method to assert that there is no wallet
with a specified public key:

```rust
fn assert_no_wallet(&self, pubkey: &PublicKey) {
    let err: String = self.inner.get_err(
        ApiKind::Service("cryptocurrency"),
        &format!("v1/wallet/{}", pubkey.to_string()),
    );
    assert_eq!(err, "Wallet not found".to_string());
}
```

Note that this method uses the `TestKitApi::get_err` method instead of `TestKitApi::get`.
While `get` will panic if returned response is erroneous (that is, has non-20x
HTTP status), `get_err` acts in the opposite way, panicking if the response
*does not* have a 40x status.

## Creating Test Network

To perform testing, we first need to create a network emulation – the eponymous
`TestKit`. `TestKit` provides a point of view of a single full node (a validator
or an auditor) in an imaginary Exonum blockchain network.

!!! note
    Unlike real Exonum nodes, testkit does not actually start a web server in order
    to process requests. Instead, they are processed synchronously,
    in the same process as the test code itself. For example, a call
    to the `get_wallet` method in `CryptocurrencyApi`
    will directly invoke [the handler](create-service.md#api-for-read-requests)
    we have defined for the respective read request.

Because `TestKit` will be used by all tests, it is natural to move its constructor
to a separate function:

```rust
fn create_testkit() -> (TestKit, CryptocurrencyApi) {
    let testkit = TestKitBuilder::validator()
        .with_service(CurrencyService)
        .create();
    let api = CryptocurrencyApi { inner: testkit.api() };
    (testkit, api)
}
```

That is, we create a network emulation, in which there is a single validator node,
and a single `CurrencyService`. `TestKit` supports
testing several services at once, as well as more complex network configurations,
but this functionality is not needed in our case.
After the testkit is created, we extract its API, wrap it,
and return the resulting tuple.

## Tests

### Wallet Creation

> **Test:** `test_create_wallet`

Our first test is very simple: we want to create a single wallet with the help
of the corresponding API call and make sure that the wallet is actually
persisted by the blockchain.

```rust
#[test]
fn test_create_wallet() {
    let (mut testkit, api) = create_testkit();
    // Create and send a transaction via API
    let (tx, _) = api.create_wallet("Alice");
    testkit.create_block();

    // Check that the user indeed is persisted by the service
    let wallet = api.get_wallet(tx.pub_key());
    assert_eq!(wallet.pub_key(), tx.pub_key());
    assert_eq!(wallet.name(), tx.name());
    assert_eq!(wallet.balance(), 100);
}
```

Per Rust conventions, the test is implemented as a zero-argument function
with a `#[test]` annotation. This function will be invoked during testing;
if it does not panic, the test is considered passed.

Note that we call `create_block` after sending a transaction via HTTP API. This
is because the API call itself does not change the blockchain; it only puts
the transaction to the pool of candidates for inclusion into future blocks.
The `create_block` method creates a block with all transactions from this pool,
which is just what we need.

To run the test, execute `cargo test` in the shell:

```none
$ cargo test
# (Some output skipped)
running 1 test
test test_create_wallet ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

If we remove or comment out the `create_block` call, the test will fail:

```none
running 1 test
test test_create_wallet ... FAILED

failures:

---- test_create_wallet stdout ----
  thread 'test_create_wallet' panicked at 'Unexpected response status: NotFound'
```

This is because the `api.get_wallet` call in the test requests information about
a wallet not present in the blockchain storage. According to
[the handler logic](create-service.md#api-for-read-requests) for `get_wallet`,
this results in a response with the 404 status, which causes
the testkit API to panic – it did not expect the error!

### Successful Transfer

> **Test:** `test_transfer`

Let’s test a transfer between two wallets. First, we need to create the testkit
and the wallets:

```rust
let (mut testkit, api) = create_testkit();
let (tx_alice, key_alice) = api.create_wallet("Alice");
let (tx_bob, _) = api.create_wallet("Bob");
testkit.create_block();
```

Check that wallets are committed to the blockchain:

```rust
let wallet = api.get_wallet(tx_alice.pub_key());
assert_eq!(wallet.balance(), 100);
let wallet = api.get_wallet(tx_bob.pub_key());
assert_eq!(wallet.balance(), 100);
```

Then, we create a transaction from Alice to Bob and add it to the new block
on the blockchain:

```rust
let tx = TxTransfer::new(
    tx_alice.pub_key(),
    tx_bob.pub_key(),
    10, // transferred amount
    0, // seed
    &key_alice,
);
api.transfer(&tx);
testkit.create_block();
```

Note that we have used Alice’s secret key `key_alice` to sign the transfer transaction.
(This is the reason why the `create_wallet` method in the API wrapper returns
a secret key along with the created transaction.)

Finally, we verify that Alice’s and Bob’s balances have changed correspondingly:

```rust
let wallet = api.get_wallet(tx_alice.pub_key());
assert_eq!(wallet.balance(), 90);
let wallet = api.get_wallet(tx_bob.pub_key());
assert_eq!(wallet.balance(), 110);
```

!!! tip
    Try to remove either of `create_block` invocations in the test. The test should
    obviously fail if the second invocation is removed, as the transfer is
    no longer committed. There is a good chance it will still fail if only the first
    invocation is removed (along with the initial verification of wallets’ balances).
    Why? The second `create_block` call should commit all three transactions, right?
    Well, it does, but the ordering of these transactions is non-deterministic
    (just like in real Exonum nodes). Thus, with a bad luck one of `TxCreateWallet`
    transactions may be executed *after* the transfer, in which case the transfer
    will fail.

### Transfer to Non-Existing Wallet

> **Test:** `test_transfer_to_nonexisting_wallet`

Unlike in real Exonum network, you can control which transactions the testkit
will include into the next block. This allows to test different orderings
of transactions, even those that would be hard (but not impossible) to reproduce
in the real network.

Let’s test a case when Alice sends a transaction to Bob while the Bob’s wallet
is not committed. The test is quite similar to the previous one; one difference
is the first `create_block` call is replaced with

```rust
testkit.create_block_with_tx_hashes(&[tx_alice.hash()]);
```

While `create_block` includes all pooled transactions into a new block, the new method
is more fine-grained; it includes only transactions with the given hash digests.
Thus, after the call the Alice’s transaction is processed and the Bob’s one is not.
Correspondingly, we should replace the initial balance verification
for Bob’s wallet with the check that his wallet does not exist:

```rust
api.assert_no_wallet(tx_bob.pub_key());
```

We also need to replace the second `create_block` call:

```rust
testkit.create_block_with_tx_hashes(&[tx.hash()]);
```

That is, we create a block with the transfer transaction only, while Bob’s
`TxCreateWallet` is still left hanging.

Finally, we check that Alice did not send her tokens to nowhere:

```rust
let wallet = api.get_wallet(tx_alice.pub_key());
assert_eq!(wallet.balance(), 100);
```

### Other Tests

[The test suite][tests-api.rs] also contains other tests, but they generally follow
the same pattern that was used in the tests discussed above:

- Initialize the testkit
- Introduce changes to the blockchain via transactions
- Use read requests to check that the changes are as expected

!!! tip
    In some cases, it makes sense to replace the last stage with verifying data
    in the blockchain storage directly. This can be done by obtaining
    a [`snapshot`][TestKit-snapshot] from the testkit and then instantiating
    a service schema (such as `CurrencySchema` in the demo service) with it.

## Conclusion

Testing is arguably just as important in software development as coding, especially
in typical blockchain applications. The testkit framework allows to streamline
the testing process for Exonum services.

[integration-testing]: http://doc.crates.io/manifest.html#integration-tests
[tests-api.rs]: https://github.com/exonum/cryptocurrency/blob/master/tests/api.rs
[TestKitApi]: https://docs.rs/exonum-testkit/0.1.1/exonum_testkit/struct.TestKitApi.html
[TestKit-snapshot]: https://docs.rs/exonum-testkit/0.1.1/exonum_testkit/struct.TestKit.html#method.snapshot
