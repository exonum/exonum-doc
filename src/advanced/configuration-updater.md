# Configuration Update Service

<!-- cspell:ignore postvote -->

**Configuration update service** allows modifying
[the global configuration](../architecture/configuration.md)
by the means of *proposing* a new configuration and *voting* for proposed
configurations among the validators.

The global configuration may need to be modified for various reasons:

- Changes in the validator set (validators being added, replaced, or removed)
- Fine tuning of the consensus algorithm parameters
- Changes in the global configuration of services (e.g., the anchoring interval
  in [the anchoring service](bitcoin-anchoring.md))

## General Idea

Any validator node can propose a new configuration, by broadcasting a
corresponding propose transaction to the network. The transaction includes a new
configuration in the JSON format, along with two auxiliary fields:

- `actual_from` is a non-negative integer height,
  upon reaching which the new configuration (if accepted) will become active.
- `previous_cfg_hash` is the hash of the configuration that the proposal
  updates.

Validators may vote for or against configuration proposals by submitting vote
transactions to the network. Each validator can cast
a single vote either for or against any configuration proposal (but not both).
If the proposal gets a supermajority of approving votes
(more than 2/3 of the validators), then the proposal becomes locked in,
and is referred to as the *following configuration*. All the validators
switch to the following configuration (activate it) as soon as they reach
the `actual_from` specified in the proposal.

!!! note
    Nodes can have only single following configuration. After a
    configuration proposal got a supermajority of votes and became the following
    configuration, nodes can not vote for a new proposal until the following
    configuration is activated.

There may be several proposals with the same `previous_cfg_hash`; the
transaction execution rules guarantee that only one of them will get activated.

!!! note
    The threshold of 2/3 of validators is chosen to reflect the security
    model used in [the consensus algorithm](../architecture/consensus.md).
    According to this model, up to 1/3 of validators may be compromised or be
    non-responsive at any time.

## REST API

Configuration update service specifies a set of public and private endpoints.

- Public APIs for read requests:

    - [Actual configuration](#actual-configuration)
    - [Following configuration](#following-configuration)
    - [Configuration by hash](#configuration-by-hash)
    - [Votes for a configuration](#votes-for-a-configuration)
    - [List of committed configurations](#committed-configurations)
    - [List of proposed configurations](#proposed-configurations)

- Transactions with their corresponding private APIs:

    - [Configuration proposal](#configuration-proposal)
    - [Vote for configuration](#vote-for-proposal)
    - [Vote against configuration](#vote-against-proposal)

All REST endpoints share the same base path, denoted **{base_path}**,
equal to `/api/services/configuration/v1`.

!!! tip
    See [*Services*](../architecture/services.md) for a description of
    types of endpoints in services.

!!! tip
    See [the configuration update service tutorial][http_api] for more details
    on the configuration update service API, and [this][response_samples] for
    API examples.

### Types

As per [Google Closure Compiler][closure] conventions,
`?` before the type denotes a nullable type, and `=` after the type denotes
an optional type.

#### Integer

`integer` type denotes a non-negative integer number.

#### Hash, PublicKey

`Hash` and `PublicKey` types are hexadecimal strings of the appropriate length
(64 hex digits, i.e., 32 bytes).

#### ConfigBody

`ConfigBody` is a JSON object corresponding to the
[Exonum config][stored_configuration] serialization. It has the following
fields:

- **actual_from**: integer  
  The height from which the configuration became actual.
- **consensus**: Object  
  [Consensus-specific configuration parameters][genesis-consensus].
- **previous_cfg_hash**: Hash  
  Hash of the previous active configuration.
- **services**: Object  
  Service-specific configuration parameters.
- **validator_keys**: Array<PublicKey\>  
  List of public keys of the validators.

#### Propose

`Propose` is a JSON object corresponding to the [Exonum config][config_propose]
serialization. It has the following fields:

- **tx_propose**: Object  
  Information about configuration.
- **tx_propose.cfg**: string  
  String containing JSON serialization of proposed configuration.
- **votes_history_hash**: Hash  
  Hash of the proposed configuration.
- **num_validators**: integer  
  Number of validators that can vote for the proposal.

### Public APIs

#### Actual Configuration

```none
GET {base_path}/configs/actual
```

Looks up the actual global configuration.

##### Parameters

None.

##### Response

JSON object with the following fields:

- **config**: ConfigBody  
  Global configuration presently in use.
- **hash**: Hash  
  Hash of the actual configuration.
- **propose**: Hash
  Hash of the transaction containing a new configuration proposal.
- **votes**: Array of objects
  Information on the votes of the validators for a new configuration.

#### Following Configuration

```none
GET {base_path}/configs/following
```

Looks up the locked-in following configuration which has not taken effect yet.
Returns `null` if no configuration is locked in.

##### Parameters

None.

##### Response

JSON object with the following fields:

- **config**: ConfigBody  
  Global configuration locked in to take effect in the future.
- **hash**: Hash  
  Hash of the following configuration.
- **propose**: Hash
  Hash of the transaction containing a new configuration proposal.
- **votes**: Array of objects
  Information on the votes of the validators for a new configuration.

#### Configuration by Hash

```none
GET {base_path}/configs?hash={config_hash}
```

Looks up configuration (including proposals) by the hash.

##### Parameters

- **hash**: Hash
  Hash of configuration to look up.

##### Response

JSON object with the following fields:

- **committed_config**: ?ConfigBody  
  Configuration with the specified hash.
  If only a proposal is present, the value is `null`.
- **propose**: ?Propose  
  Proposal for the retrieved configuration.
  If the configuration is not a result of a proposal (the genesis
  configuration), the value is `null`.

#### Votes for a Configuration

```none
GET {base_path}/configs/votes?hash={config_hash}
```

Looks up votes for a configuration proposal by the configuration hash.

##### Parameters

- **hash**: Hash
  Hash of configuration to look up

##### Response

A nullable JSON array `?Array<?Vote>` containing
votes for the configuration, where each vote is
[the JSON serialization](../architecture/transactions.md#serialization)
of [the corresponding vote transaction](#vote-for-proposal).
Indexing of the votes in the array corresponds
to the indexing of validator public keys in the
[actual configuration](../architecture/configuration.md#genesis).
If a vote from the validator is absent, then `null` is returned
at the corresponding index. If the configuration with `config_hash` is absent,
`null` is returned instead of the whole array.

#### Committed Configurations

```none
GET {base_path}/configs/committed
```

Looks up all committed configurations, optionally filtered by
the activation height and/or the previous configuration hash.

##### Query Parameters

- **previous_cfg_hash**: Hash
  If present, filters configurations by the specified previous configuration
  hash.
- **actual_from**: integer
  If present, filters configurations by the specified minimum for the height
  from which the configuration became actual.

##### Response

Array of objects with the following fields:

- **config**: ConfigBody  
  Committed configuration satisfying filter criteria.
- **hash**: Hash  
  Hash of the configuration.
- **propose**: Hash
  Hash of the transaction containing a new configuration proposal.
- **votes**: Array of objects
  Information on the votes of the validators for a new configuration.

The elements of the array are ordered by the order, in which
configuration proposals were committed as transactions to the Exonum blockchain.

#### Proposed Configurations

```none
GET {base_path}/configs/proposed
```

Looks up all proposed configurations, optionally filtered by
the activation height and/or the previous configuration hash.

##### Query Parameters

- **previous_cfg_hash**: Hash
  If present, filters configurations by the specified previous configuration
  hash.
- **actual_from**: integer
  If present, filters configurations by the specified minimum for the height
  from which the configuration will become actual.

##### Response

Array of objects with the following fields:

- **propose_data**: ?Propose
  Information on the new proposed configuration.
- **hash**: Hash  
  Hash of the proposed configuration.

The elements of the array appear in the order, in which configuration proposals
were committed as transactions to the Exonum blockchain.

### Transactions and Private APIs

Configuration service has a separate API for creating transactions. Each
transaction has its corresponding endpoint to make a POST request.

#### Configuration Proposal

##### Transaction Description

`Propose` transaction is a new configuration proposal.

###### Data Layout

- **cfg**: string  
  String serialization of the `ConfigBody` JSON object,
  which describes the proposed configuration.

###### Verification

Signature of the transaction is verified against the public key of the
transaction author, specified in the transaction header.

###### Execution

A `Propose` transaction is only successfully executed
with a state change if all of the following conditions take place:

- `cfg` is a valid stringified JSON object corresponding to the `ConfigBody`
  format
- `cfg.previous_cfg_hash` equals to hash of the actual configuration
- `cfg.actual_from` is greater than the current height of the blockchain,
  determined as the height of the latest committed block + 1
- There is no agreed-upon following configuration
- The actual configuration contains the public key of the transaction author in
  the array of validator keys
- There is no previously submitted configuration proposal, which evaluates
  to the same configuration hash

If all the checks pass, the proposal is recorded as a candidate
for the next configuration. The validators can then vote
for or against the proposal.

##### Submit Configuration Proposal Endpoint

```none
POST {base_path}/configs/postpropose
```

Creates a [`Propose` transaction](#configuration-proposal).
The transaction signature is computed automatically based on the identity of the
node that processes the POST request - the signature is computed
based on the corresponding private key of the node stored in
[the local configuration](../architecture/configuration.md).

###### Parameters

- **config_body**: ConfigBody  
  Body of the request; the proposed configuration in the JSON format.

###### Response

JSON object with the following fields:

- **cfg_hash**: Hash  
  Hash of the proposed configuration. Should be used as `hash`
  parameter of [`postvote` requests](#submit-vote-for-proposal-endpoint).
- **tx_hash**: Hash  
  Hash of the corresponding `Propose` transaction.

#### Vote for Proposal

##### Transaction Description

`Vote` is a transaction that implements voting for a previously
proposed configuration.

###### Data Layout

- **cfg_hash**: Hash  
  Hash of configuration to vote for.

###### Verification

Signature of the transaction is verified against the public key of the
transaction author, specified in the transaction header.

###### Execution

Vote transactions will only get submitted and executed with state change
if all of the following conditions take place:

- `cfg_hash` references a known proposed configuration `cfg`
- There is no agreed-upon following configuration
- The actual configuration contains the public key of the transaction author in
  the array of validator keys
- `cfg.previous_cfg_hash` is equal to hash of the actual configuration
- `cfg.actual_from` is greater than the current height
- No vote on the same proposal from the same validator has been
  submitted previously

If all the checks pass, the vote is recorded. If there is
a sufficient number of votes approving the configuration, it is scheduled to
be accepted as specified in its proposal.

##### Submit Vote for Proposal Endpoint

```none
POST {base_path}/configs/postvote
```

Creates a [`Vote` transaction](#vote-for-proposal).
As with the previous endpoint, the transaction signature is computed
automatically.

###### Parameters

- **hash**: Hash  
  Body of the request; hash of the configuration to vote for.

###### Response

JSON object with the following fields:

- **tx_hash**: Hash  
  Hash of the corresponding `Vote` transaction.

#### Vote against Proposal

##### Transaction Description

`VoteAgainst` is a transaction that implements voting against a previously
proposed configuration.

###### Data Layout

- **cfg_hash**: Hash  
  Hash of the configuration to be voted against.

###### Verification

Signature of the transaction is verified against the public key of the
transaction author, specified in the transaction header.

###### Execution

Vote transactions will only get submitted and executed with state change
if all of the following conditions take place:

- `cfg_hash` references a known proposed configuration `cfg`
- There is no agreed-upon following configuration
- The actual configuration contains the public key of the transaction author in
  the array of validator keys
- `cfg.previous_cfg_hash` is equal to hash of the actual configuration
- `cfg.actual_from` is greater than the current height
- No vote on the same proposal from the same validator has been
  submitted previously

If all the checks pass, the vote is recorded.

##### Submit Vote against Proposal Endpoint

```none
POST {base_path}/configs/postagainst
```

Creates a [`VoteAgainst` transaction](#vote-against-proposal).
As with the previous endpoint, the transaction signature is computed
automatically.

###### Parameters

- **hash**: Hash  
  Body of the request; hash of the configuration to be voted against.

###### Response

JSON object with the following fields:

- **tx_hash**: Hash  
  Hash of the corresponding `VoteAgainst` transaction.

[stored_configuration]: https://github.com/exonum/exonum/blob/master/exonum/src/blockchain/config.rs
[config_propose]: https://github.com/exonum/exonum/blob/master/services/configuration/src/lib.rs
[http_api]: https://github.com/exonum/exonum/blob/master/services/configuration/doc/testnet-api-tutorial.md#global-variable-service-http-api
[response_samples]: https://github.com/exonum/exonum/blob/master/services/configuration/doc/response-samples.md
[closure]: https://github.com/google/closure-compiler/wiki/Annotating-JavaScript-for-the-Closure-Compiler
[ta-config]: https://docs.rs/exonum/0.4.0/exonum/blockchain/config/enum.TimeoutAdjusterConfig.html
[genesis-consensus]: ../architecture/configuration.md#genesisconsensus
