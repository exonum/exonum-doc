# Configuration Update Service

**Configuration update service** allows modifying [the global configuration](../../architecture/configuration.md)
by the means of *proposing* a new configuration and *voting* for proposed configurations
among the validators.

## General Idea

Any validator node can propose a new configuration, by broadcasting a corresponding
propose transaction to the network. The transaction includes a new configuration
in the JSON format, along with two auxiliary fields:

- `actual_from` is a non-negative integer height,
  upon reaching which the new configuration (if accepted) will activate.
- `previous_cfg_hash` is the hash of the configuration that the proposal updates

Validators may vote for configuration proposals by submitting vote transactions
to the network. Each validator can cast
a single vote for any configuration proposal. If the proposal gets a supermajority
of votes (more than 2/3 of the validators), then the proposal becomes locked in,
and is referred to as the *following configuration*. All the validators
switch to the following configuration (activate it) as soon as they reach
the `actual_from` specified in the proposal.

There may be several proposals with the same `previous_cfg_hash`; the transaction
execution rules guarantee that only one of them will get activated.

**Notice.** The threshold of 2/3 of validators is chosen to reflect the security
model used in [the consensus algorithm](../consensus/consensus.md). According
to this model, up to 1/3 of validators may be compromised or be non-responsive at
any time.

## REST API

Configuration update service specifies a set of public and private endpoints.

- Public read requests:

    - [Actual configuration](#actual-configuration)
    - [Following configuration](#following-configuration)
    - [Configuration by hash](#configuration-by-hash)
    - [Votes for a configuration](#votes-for-configuration)
    - [List committed configurations](#committed-configurations)
    - [List proposed configurations](#proposed-configurations)

- Transactions with corresponding private APIs:

    - [Propose configuration](#configuration-proposal), [private API](#submit-configuration-proposal)
    - [Vote for configuration](#vote-for-proposal), [private API](#submit-vote-for-proposal)

All REST endpoints share the same base path, denoted **{base_path}**,
equal to `/api/services/configuration/v1`.

**Tip.** See [*Services*](../../architecture/services.md) for a description of
types of endpoints in services.

**Tip.** See [the configuration update service tutorial][http_api] for more details
on the configuration update service API, and [this][response_samples] for API
examples.

### Types

As per [Google Closure Compiler][closurec] conventions,
`?` before the type denotes a nullable type, and `=` after the type denotes
an optional type.

#### Integer

`integer` type denotes a non-negative integer number.

#### Hash, PublicKey

`Hash` and `PublicKey` types are hexadecimal strings of the appropriate length
(64 hex digits, i.e., 32 bytes).

#### ConfigBody

`ConfigBody` is a JSON object corresponding to the [Exonum
config][stored_configuration] serialization. It has the following fields:

- **previous_cfg_hash**: Hash  
  Hash of the previous active configuration.
- **actual_from**: integer  
  The height from which the configuration became actual.
- **validators**: Array\<PublicKey\>  
  List of validators' public keys.
- **consensus**: Object  
  Consensus-specific configuration parameters.
- **consensus.peers_timeout**: integer  
  Peer exchange timeout (in ms).
- **consensus.propose_timeout**: integer  
  Proposal timeout (ms) after the new height beginning.
- **consensus.round_timeout**: integer  
  Interval (ms) between rounds.
- **consensus.status_timeout**: integer  
  Period (ms) of sending a `Status` message.
- **consensus.txs_block_limit**: integer  
  Maximum number of transactions per block.
- **services**: Object  
  Service-specific configuration parameters.

#### Propose

`Propose` is a JSON object corresponding to the [Exonum
config][config_propose] serialization. It has the following fields:

- **tx_propose**: Object  
  Information about configuration and its author.
- **tx_propose.from**: PublicKey  
  Author's public key.
- **tx_propose.cfg**: string  
  String containing JSON serialization of proposed configuration.
- **votes_history_hash**: Hash  
  Hash of the proposed configuration.
- **num_votes**: integer  
  Number of votes for the proposed configuration.

## Read Requests

### Actual Configuration

```none
GET {base_path}/configs/actual
```

Looks up the actual global configuration.

#### Parameters

None.

#### Response

JSON object with the following fields:

- **config**: ConfigBody  
  Global configuration presently in use.
- **hash**: Hash  
  Hash of the actual configuration.

### Following Configuration

```none
GET {base_path}/configs/following
```

Looks up the locked-in following configuration which hasn’t taken effect yet.
Returns `null` if no configuration is locked in.

#### Parameters

None.

#### Response

JSON object with the following fields:

- **config**: ConfigBody  
  Global configuration locked in to take effect in the future.
- **hash**: Hash  
  Hash of the following configuration.

### Configuration by Hash

```none
GET {base_path}/configs/{config_hash}
```

Looks up configuration (including proposals) by the hash.

#### Parameters

- **config_hash**: Hash  
  Hash of configuration to look up.

#### Response

JSON object with the following fields:

- **committed_config**: ?ConfigBody  
  Configuration with the specified hash.
  If only a proposal is present, `null`.
- **propose**: ?Propose  
  Proposal for the retrieved configuration.
  If the configuration is not a result of a proposal (the genesis configuration),
  `null`.

### Votes for Configuration

```none
GET {base_path}/configs/{config_hash}/votes
```

Looks up votes for a configuration proposal by the configuration hash.

#### Parameters

- **config_hash**: Hash  
  Hash of configuration to look up

#### Response

JSON object with the following fields:

- **Votes**: Array\<?Vote\>  
  Votes for the configuration. Indexing of the `Votes` array corresponds
  to the indexing of validator public keys in the [actual configuration](../../architecture/configuration.md#genesis).
  If a vote from the validator is absent, then `null` is returned
  at the corresponding index.

### Committed Configurations

```none
GET {base_path}/configs/committed
```

Looks up all committed configurations, optionally filtered by
the activation height and/or the previous configuration hash.

#### Query Parameters

- **previous_config_hash**: Hash=  
  If present, filters configurations by the specified previous configuration hash.
- **actual_from**: integer=  
  If present, filters configurations by the specified minimum for the height
  from which the configuration became actual.

#### Response

Array of objects with the following fields:

- **config**: ConfigBody  
  Committed configuration satisfying filter criteria.
- **hash**: Hash  
  Hash of the configuration.

The elements of the array are ordered by the order, in which
configuration proposals were committed as transactions to the Exonum blockchain.

### Proposed Configurations

```none
GET {base_path}/configs/proposed
```

Looks up all proposed configurations, optionally filtered by
the activation height and/or the previous configuration hash.

#### Query Parameters

- **previous_config_hash**: Hash=  
  If present, filters configurations by the specified previous configuration hash.
- **actual_from**: integer=  
  If present, filters configurations by the specified minimum for the height
  from which the configuration will become actual.

#### Response

Array of objects with the following fields:

- **config**: ConfigBody  
  Proposed configuration satisfying filter criteria.
- **hash**: Hash  
  Hash of the configuration.

The elements of the array are ordered by the order, in which
configuration proposals were committed as transactions to the Exonum blockchain.

## Transactions

### Configuration Proposal

`TxConfigPropose` transaction is a new configuration proposal.

#### Data Layout

- **cfg**: string  
  String serialization of the `ConfigBody` JSON object,
  which describes the proposed configuration.
- **from**: PublicKey  
  Public key of the transaction author.

#### Verification

Signature of the transaction is verified against the public key
specified in `from`.

#### Execution

A `TxConfigPropose` transaction is only successfully executed
with a state change if all of the following conditions take place:

1. `cfg` is a valid stringified JSON object corresponding to the `ConfigBody`
  format.
2. `cfg.previous_cfg_hash` equals to hash of the *actual* configuration.
3. `cfg.actual_from` is greater than the *current height* of the blockchain,
  determined as the height of the latest committed block + 1.
4. A *following* configuration isn't present.
5. The *actual* configuration contains the `from` public key in the array of
  validator keys.
6. There isn't a previously submitted configuration proposal, which evaluates
  to the same configuration hash.

If all the checks pass, the execution results in modifying some tables.

### Vote for Proposal

`TxVote` implements voting for a previously proposed configuration.

#### Data Layout

- **cfg_hash**: Hash  
  Hash of configuration to vote for.
- **from**: PublicKey  
  Public key of the transaction author.

#### Verification

Signature of the transaction is verified against the public key
specified in `from`.

#### Execution

Vote transactions will only get submitted and executed with state change
if all of the following conditions take place:

1. `cfg_hash` references a known proposed configuration `cfg`.
2. A *following* configuration isn't present.
3. The *actual* configuration contains the `from` public key in the array of
  validator keys.
4. `cfg.previous_cfg_hash`, is equal to hash of the *actual* configuration.
5. `cfg.actual_from` is greater than the *current height*.
6. No vote for the same proposal from the same `from` has been
  submitted previously.

If all the checks pass, execution results in modifying some tables.

## Private APIs

### Submit Configuration Proposal

```none
POST {base_path}/configs/postpropose
```

Creates a [`TxConfigPropose` transaction](#configuration-proposal).
The `from` field of the transaction and its signature are computed
automatically based on the identity of the node that processes the POST request:
`from` is set to the node’s public key, and the signature is computed
based on the corresponding private key stored in [the local configuration](../../architecture/configuration.md).

#### Parameters

- **config_body**: ConfigBody  
  Body of the request; the proposed configuration in the JSON format.

#### Response

JSON object with the following fields:

- **cfg_hash**: Hash  
  Hash of the proposed configuration. Should be used as `config_hash_vote_for`
  parameter of [`postvote` requests](#submit-vote-for-proposal).
- **tx_hash**: Hash  
  Hash of the corresponding `TxConfigPropose` transaction.

### Submit Vote for Proposal

```none
POST {base_path}/configs/{config_hash_vote_for}/postvote
```

Creates a [`TxVote` transaction](#configuration-proposal).
As with the previous endpoint, the `from` field of the transaction
and its signature are computed automatically.

#### Parameters

- **config_hash_vote_for**: Hash  
  Hash of the configuration to vote for.

#### Response

JSON object with the following fields:

- **tx_hash**: Hash  
  Hash of the corresponding `TxVote` transaction.

[stored_configuration]: http://exonum.com/doc/crates/exonum/blockchain/config/struct.StoredConfiguration.html
[config_propose]: http://exonum.com/doc/crates/configuration_service/struct.StorageValueConfigProposeData.html
[http_api]: https://github.com/exonum/exonum-configuration/blob/master/doc/testnet-api-tutorial.md#global-variable-service-http-api
[response_samples]: https://github.com/exonum/exonum-configuration/blob/master/doc/response-samples.md
[closurec]: https://github.com/google/closure-compiler/wiki/Annotating-JavaScript-for-the-Closure-Compiler
