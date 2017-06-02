# Configuration Update Service

Configuration service of Exonum blockchain allows modifying Exonum blockchain
configuration by means of propose configuration and vote for proposed configuration
transactions signed by validators who are actual blockchain participants.

Any validator node can propose a new configuration. Other validators can vote for
the proposal. If the proposal gets the majority of votes, then all the validators
switch to the new configuration as soon as they reach the height from which this
configuration become actual.

Configuration service contains http api implementation for public queries (get
actual/following configuration, etc.) and private queries, intended for use only
by validator nodes' maintainers (post configuration propose, post vote for a
configuration propose). When processing a POST request, configuration service
checks validity of the request (see [Propose and vote transactions
restrictions](#propose-and-vote-transactions-restrictions) section).

It also contains auxiliary fields. These fields are used to identify nodes that
can vote for this configuration and determining the activation time of the
configuration in all nodes simultaneously:

- `actual_from` - blockchain height, upon reaching which current configuration is
  to become actual.
- `previous_cfg_hash` - hash of previous configuration, which validators' set is
  allowed to cast votes for current configuration.

## Global variable service http api

All `hash`es and `public_key`s below are hexadecimal strings.

`ConfigBody` is a JSON object corresponding to the [Exonum
config][stored_configuration] serialization. It has the following fields:

- **previous_cfg_hash**: Hash  
  Hash of the previous active configuration.

- **actual_from**: Integer
  The height from which the configuration became actual.

- **validators**: Array\<PublicKey\>  
  List of validators' public keys.

- **consensus**: Object  
  Consensus-specific configuration parameters.

- **consensus.peers_timeout**  
  Peer exchange timeout (in ms).

- **consensus.propose_timeout**  
  Proposal timeout (ms) after the new height beginning.

- **consensus.round_timeout**  
  Interval (ms) between rounds.

- **consensus.status_timeout**  
  Period (ms) of sending a `Status` message.

- **consensus.txs_block_limit**  
  Maximum number of transactions per block.
  
- **services**: Object  
  Services-specific configuration parameters.

`propose_template` is a JSON object corresponding to the [Exonum
config][config_propose] serialization. It has the following fields:

- **tx_propose**: Object
  Information about configuration and its author.

- **tx_propose.from**: PublicKey
  Author's public key.

- **tx_propose.cfg**: ConfigBody
  String containing `ConfigBody` of proposed configuration.

- **votes_history_hash**: Hash
  Hash of the proposed configuration.

- **num_votes**: Integer
  Number of votes for the proposed configuration.

See [Configuration service tutorial][http_api] for more details on http api.

**{base_path}** below stands for `/api/services/configuration/v1`

Response samples may be found [here][response_samples].

### Actual Configuration

    GET {base_path}/configs/actual

Looks up the actual global configuration.

#### Parameters

None.

#### Response template

```JSON
{
  "config": config_body,
  "hash": config_hash
}
```

### Following Configuration

    GET {base_path}/configs/following

Looks up already scheduled following configuration which hasn't yet taken effect.
Returns `null` if no configuration is scheduled.

#### Parameters

None.

#### Response template

```JSON
{
  "config": config_body,
  "hash": config_hash
}
```

### Configuration by Hash

    GET {base_path}/configs/{config_hash}

Looks up configuration (including proposals) by configuration hash. If no propose
was submitted for a configuration (genesis configuration), then `propose` field
is `null`. If only propose is present, then `committed_config` field is `null`.
`propose` key has json-object values, that match `propose_template`.

#### Parameters

`config_hash` - hash of configuration to look up.

#### Response template

```JSON
{
  "committed_config": config_body,
  "propose": propose_template
}
```

### Votes for Configuration

    GET {base_path}/configs/{config_hash}/votes

Looks up votes for a configuration propose by configuration hash. If a vote from
the validator is absent, then `null` is returned at the corresponding index in
json array. Indexing of the `Votes` array corresponds to the indexing of
validators public keys in [actual
configuration](../../architecture/configuration.md#genesis).

#### Parameters

`config_hash` - hash of configuration to look up.

#### Response template

```JSON
{
  "Votes": [
    {
      "from": public_key,
      "cfg_hash": config_hash
    },
    null,
    ...
  ]
}
```

### Committed Configurations

    GET {base_path}/configs/committed?previous_cfg_hash

Looks up all committed configurations in the order configuration proposals are
committed as transactions to the Exonum blockchain.

#### Query Parameters

- `previous_config_hash`: hash (optional)  
  Filters configurations by the specified previous configuration hash.

- `lowest_actual_from`: integer (optional)
  Filters configurations by the specified minimum for the height from which the
  configuration became actual.

#### Response template

```JSON
[
  {  
    "config": config_body,
    "hash": config_hash
  },
  {  
    "config": config_body,
    "hash": config_hash
  },
  ...
]
```

### Proposed Configurations

    GET {base_path}/configs/proposed?previous_cfg_hash

Looks up all proposed configurations in the order configuration proposals are
committed as transactions to the Exonum blockchain.

#### Query Parameters

- `previous_config_hash`: hash (optional)  
  Filters configurations by the specified previous configuration hash.

- `lowest_actual_from`: integer (optional)
  Filters configurations by the specified minimum for the height from which the
  configuration became actual.

#### Response template

```JSON
[  
  {  
    "propose-data": propose_template,
    "hash": config_hash
  },
  {  
    "propose-data": propose_template,
    "hash": config_hash
  },
  ...
]
```

### Private endpoints

Posting a new configuration can be performed by any validator maintainer via private
endpoint.

`cfg_hash`, returned in response to `postpropose` request, should be used as
`config_hash_vote_for` parameter of `postvote` request.

### Configuration update service transactions

Private endpoints are essentially helpers for creating the configuration update
service transactions.

#### Transactions data layout

`TxVote` is vote for proposed configuration.
```JSON
{
  "cfg_hash": config_hash,
  "from": public_key
}
```

`TxConfigPropose` is new configuration proposal.
```JSON
{
  "cfg": config_body,
  "from": public_key
}
```

#### Transaction parameters

`config_hash` is hex string with hash of configuration to vote for.

`public_key` is hex string with public key of transaction author.

`config_body` is string containing JSON with proposed configuration. Its format
was described above.

#### Verify step

At this step, only signature verification takes place. If any there is valid
signature on message, message gets committed to database. So the message
participates in the `tx_hash` field of the block, regardless of the further
checks results.

#### Execute step

If all the checks detailed [below](#propose-and-vote-transactions-restrictions)
pass, execution results in modifying some tables and `state_hash` field (apart
from `tx_hash`).

#### Propose and vote transactions restrictions

- Propose transactions will only get submitted and executed with state change
  if all of the following conditions take place:
   1. new config body constitutes a valid json string and corresponds to
      [StoredConfiguration](http://exonum.com/doc/crates/exonum/blockchain/config/struct.StoredConfiguration.html)
      format.

   1. `previous_cfg_hash` in proposed config body equals to hash of *actual*
      config.

   1. `actual_from` in proposed config body is greater than *current height*.
      *current height* is determined as the height of last
      committed block + 1. This is important to obtain sequential view of
      configs commit history. And, more important, the linear view of history
      of votes which conditioned scheduling of a config.

   1. a *following* config isn't already present.

   1. *actual* config contains the node-sender's public key in array of
      `validators` field, as specified in `from` field of propose
      transaction. The `from` field is determined by public key of node whose
      `postpropose` endpoint is accessed for signing the transaction on
      maintainter's behalf.

   1. propose of config, which evaluates to the same hash, hasn't already
      been submitted.

- Vote transactions will only get submitted and executed with state change
  if all of the following conditions take place:
   1. the vote transaction references a config propose with known config
      hash.

   1. a *following* config isn't already present.

   1. *actual* config contains the node-sender's public key in
      `validators` field, as specified in `from` field of vote transaction.
      The `from` field is determined by public key of node whose
      `postvote` endpoint is accessed for signing the transaction on
      maintainter's behalf.

   1. `previous_cfg_hash` in the config propose, which is referenced by
      vote transaction, is equal to hash of *actual* config.

   1. `actual_from` in the config propose, which is referenced by vote
      transaction, is greater than *current height*.

   1. no vote for the same proposal from the same node's public key has been
      submitted previously.

### Propose Configuration

    POST {base_path}/configs/postpropose

Posts proposed configuration body.

#### Parameters

`config_body` to propose. It should be sent as a request body.

#### Response template

```JSON
{
  "cfg_hash": configuration_hash,
  "tx_hash": transaction_hash
}
```

### Vote for Configuration

    POST {base_path}/configs/{config_hash_vote_for}/postvote

Votes for a configuration having specific hash.

#### Parameters

`config_hash_vote_for` is a configuration hash to vote for.

#### Response template

```JSON
{
  "tx_hash": transaction_hash
}
```

[stored_configuration]: http://exonum.com/doc/crates/exonum/blockchain/config/struct.StoredConfiguration.html
[config_propose]: http://exonum.com/doc/crates/configuration_service/struct.StorageValueConfigProposeData.html
[http_api]: https://github.com/exonum/exonum-configuration/blob/master/doc/testnet-api-tutorial.md#global-variable-service-http-api
[response_samples]: https://github.com/exonum/exonum-configuration/blob/master/doc/response-samples.md
