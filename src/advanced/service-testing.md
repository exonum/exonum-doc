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

Functions for consensus algorithm testing:

- `timestamping_sandbox`  
  Creates sandbox with `TimestampingService` and `ConfigUpdateService`

- `recv`  
  Simulate receiving message by the node

- `send`  
  Check if the node sent message

- `broadcast`  
  Checks if the node broadcasted message

Code example:

```Rust
// Check for `Connect` message exchange

#[test]
fn test_sandbox_recv_and_send() {
    let s = timestamping_sandbox();
    let (public, secret) = gen_keypair();

    // Simulate receiving Connect message by the node
    s.recv(Connect::new(&public, s.a(2), s.time(), &secret));

    // Check if the node sent Connect message
    s.send(s.a(2), Connect::new(&s.p(0), s.a(0), s.time(), s.s(0)));
}
```

## Service Test Examples

!!! tip
    See source code for more details how sandbox is used for testing
    [the configuration update service](https://github.com/exonum/exonum-configuration/blob/master/sandbox_tests/src/lib.rs)
    and [the anchoring service](https://github.com/exonum/exonum-btc-anchoring/tree/master/sandbox_tests/tests).

To test some set of services, one can pass services list to sandbox constructor:

```Rust
let s = sandbox_with_services(vec![Box::new(TimestampingService::new()),
                                   Box::new(ConfigUpdateService::new())])
```

A service should be tested by committing service transaction and observing
subsequent changes in the blockchain and the storage state.

!!! note
    Transaction constructors are service-specific.

Useful functions for service testing:

- `add_one_height_with_transactions`  
  Allows committing a transaction.

- `broadcast`  
  Allows to check broadcasting message with particular content (transaction).

## Service Endpoints Test Examples

!!! tip
    See [source code](https://github.com/exonum/exonum-configuration/blob/master/sandbox_tests/src/api_tests.rs)
    for more details how sandbox is used for testing the configuration update
    service endpoints.

!!! note
    Each service should provide its own interface for sandbox testing of service
    endpoints.

Code example:

```
#[test]
fn test_get_actual_config() {
    let _ = init_logger();

    //create sandbox for testing configuration update service endpoints
    let api_sandbox = ConfigurationApiSandbox::new();

    // read current configuration
    let sand_cfg = api_sandbox.sandbox.cfg();
    let expected_body = ApiResponseConfigHashInfo {
        hash: sand_cfg.hash(),
        config: sand_cfg,
    };

    // read current configuration via REST API
    let resp_actual_config = api_sandbox.get_actual_config().unwrap();
    let actual_body = response_body(resp_actual_config);

    // compare current configuration with GET response
    assert_eq!(actual_body, serde_json::to_value(expected_body).unwrap());
}
```
