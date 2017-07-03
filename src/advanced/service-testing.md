# Sandbox Testing

The sandbox is used to test [services](../architecture/services.md),
[the consensus algorithm](consensus/specification.md),
and [service endpoints](../glossary.md#service-endpoint).

Sandbox is a mechanism that simulates the rest of the network for a node. Using
sandbox, one can send a message to the node and expect some response from it,
which then is checked against the reference response. With the help of the
sandbox, the consensus algorithm and the operation of the services can be tested
by sending them transactions and verifying the service response. Similarly,
tests of the public REST API can be performed.

The sandbox itself has a stub service for testing transactions.

## Consensus Algorithm tests

Sandbox tests are used to check node behavior compliance with the consensus algorithm.
Following parts of the consensus algorithm are tested:

- [Consensus messages processing](consensus/specification.md#message-processing)
- Behavior on each [stage of the consensus algorithm](consensus/specification.md#consensus-algorithm-stages)
- Timeouts processing:

    - [round timeout](consensus/specification.md#round-timeout-processing)
    - [status timeout](consensus/specification.md#status-timeout-processing)
    - [request timeout](consensus/requests.md#request-timeout)
    - [peers timeout](consensus/requests.md#peers-timeout)

- [Sending requets](consensus/requests.md#sending-requests) and
  [requests processing](consensus/requests.md#requests-processing)
- Acting as [round leader](../architecture/consensus.md#strawman-version)

!!! tip
    See [source code](https://github.com/exonum/exonum-core/blob/master/sandbox/tests/consensus.rs)
    for more details how sandbox is used for testing the consensus algorithm.

## Service Test Examples

!!! tip
    See [source code](https://github.com/exonum/exonum-configuration/blob/master/sandbox_tests/src/lib.rs)
    for more details how sandbox is used for testing
    [the configuration update service](configuration-updater.md).

!!! tip
    See [anchoring service source code](https://github.com/exonum/exonum-btc-anchoring/tree/master/sandbox_tests/tests)
    for more details how sandbox is used for testing [the anchoring service](bitcoin-anchoring.md).

## Service Endpoints Test Examples

!!! tip
    See [source code](https://github.com/exonum/exonum-configuration/blob/master/sandbox_tests/src/api_tests.rs)
    for more details how sandbox is used for testing the configuration update
    service endpoints.
