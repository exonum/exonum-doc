# Sandbox Testing

The sandbox is used to test [services](../architecture/services.md),
[the consensus algorithm](consensus/specification.md),
and [service endpoints](../glossary.md#service-endpoint).

Sandbox is a mechanism that simulates the rest of the network for a node. Using
sandbox one can send a message to the node and expect some response from it
which is then checked against the reference response. The sandbox can be used to
test the consensus algorithm and the operation of the services by sending them
transactions and verifying the service response. Similarly, tests of the public
REST API can be performed.

The sandbox itself has a stub service for testing transactions.

## Consensus Algorithm tests

Sandbox tests are used to check node behavior compliance with the consensus
algorithm. The following parts of the consensus algorithm are tested:

- [Consensus messages processing](consensus/specification.md#message-processing)
- Behavior at each [stage of the consensus algorithm](consensus/specification.md#consensus-algorithm-stages)
- Timeouts processing:

    - [round timeout](consensus/specification.md#round-timeout-processing)
    - [status timeout](consensus/specification.md#status-timeout-processing)
    - [request timeout](consensus/requests.md#request-timeout)
    - [peers timeout](consensus/requests.md#peers-timeout)

- [Sending requests](consensus/requests.md#sending-requests) and
  [processing of the requests](consensus/requests.md#requests-processing)

- Acting as a [round leader](../architecture/consensus.md#strawman-version)

!!! tip
    See [source code](https://github.com/exonum/exonum-core/blob/master/sandbox/tests/consensus.rs)
    for more details on how sandbox is used for testing the consensus algorithm.

Functions for consensus algorithm testing:

- `timestamping_sandbox`  
  Creates sandbox with `TimestampingService` and `ConfigUpdateService`

- `recv`  
  Simulates receiving message by the node

- `send`  
  Checks if a message has been sent by the node

- `broadcast`  
  Checks if the node broadcasted the message

- `add_time`  
  Emulates the situation after the specified time (as a `std::time::Duration`
  struct). Is used for timeouts testing.

- `a`  
  Gets socket address of the validator with the specified number.

- `p`  
  Gets public key of the validator with the specified number.

- `s`  
  Gets private key of the validator with the specified number.

!!! note
    The validator numbers correspond to the validator keys in the
    [`validators` list](../architecture/configuration.md#genesis) specified in
    the global configuration.

Code example:

```rust
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
    See source code for more details on how sandbox is used for testing
    [the configuration update service](https://github.com/exonum/exonum-configuration/blob/master/sandbox_tests/src/lib.rs)
    and [the anchoring service](https://github.com/exonum/exonum-btc-anchoring/tree/master/sandbox_tests/tests).

To test some set of the services, one can pass the services list to the sandbox
constructor:

```rust
let s = sandbox_with_services(vec![Box::new(TimestampingService::new()),
                                   Box::new(ConfigUpdateService::new())])
```

A service should be tested by committing the service transaction and observing
subsequent changes in the blockchain and the storage state.

!!! note
    Transaction constructors are service-specific.

Useful functions for service testing:

- `add_one_height_with_transactions`  
  Allows committing a transaction.

- `broadcast`  
  Allows to check broadcasting message with a particular content (transaction).

## Service Endpoints Test Examples

!!! tip
    See [source code](https://github.com/exonum/exonum-configuration/blob/master/sandbox_tests/src/api_tests.rs)
    for more details on how sandbox is used for testing the configuration update
    service endpoints.

!!! note
    Each service should provide its own interface for sandbox testing of
    service endpoints.

Code example:

```rust
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
