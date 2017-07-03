# Sandbox Testing

The sandbox is used to test services and consensus.

Sandbox is a mechanism that simulates the rest of the network for a node. Using
sandbox, one can send a message to the node and expect some response from it,
which then is checked against the reference response. With the help of the
sandbox, the consensus algorithm and the operation of the services can be tested
by sending them transactions and verifying the service response. Similarly,
tests of the public REST API can be performed.

The sandbox itself has a stub service for testing transactions.

## Consensus Algorithm tests

https://github.com/exonum/exonum-core/blob/master/sandbox/tests/consensus.rs

## Service Test Examples

https://github.com/exonum/exonum-configuration/blob/master/sandbox_tests/src/lib.rs

## API Test Examples

https://github.com/exonum/exonum-configuration/blob/master/sandbox_tests/src/api_tests.rs

## Testing Anchoring

https://github.com/exonum/exonum-btc-anchoring/tree/master/sandbox_tests/tests

## Testing Sandbox Itself

https://github.com/exonum/exonum-core/blob/master/sandbox/src/sandbox.rs
