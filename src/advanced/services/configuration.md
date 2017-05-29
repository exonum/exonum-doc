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
configuration propose). When processing a POST request, its validity must be
checked (see [Propose and vote transactions
restrictions](#propose-and-vote-transactions-restrictions) section).

Exonum blockchain configuration is composed of:

- consensus algorithm parameters
- list of validators' public keys - list of identities of consensus participants
- configuration of all services, plugged in for a specific blockchain instance.

It also contains auxiliary fields. These fields are used to identify nodes that
can vote for this configuration and determining the activation time of the
configuration in all nodes simultaneously:

- `actual_from` - blockchain height, upon reaching which current configuration is
  to become actual.
- `previous_cfg_hash` - hash of previous configuration, which validators' set is
  allowed to cast votes for current configuration.

## Global variable service http api

All `hash`es in tables are hexadecimal strings.
`config_body` is a valid json, corresponding to [exonum
config][stored_configuration] serialization. See [Configuration service
tutorial][http_api] for more details on http api.

**{basePath}** below stands for `/api/services/configuration/v1`

Response samples may be found [here][response_samples].

### Actual Configuration

    GET {basePath}/configs/actual

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

    GET {basePath}/configs/following

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

    GET {basePath}/configs/{config_hash}

Looks up configuration by configuration hash. If no propose was submitted for a
configuration (genesis configuration), then `propose` field is `null`. If only
propose is present, then `committed_config` field is `null`. `propose` key has
json-object values, that match **propose-template**.

#### Parameters

`config_hash` - hash of configuration to look up.

#### Response template

```JSON
{
  "committed_config":config_body,
  "propose":{  
    "num_votes":integer,
    "tx_propose":propose_transaction_body,
    "votes_history_hash":vote_history_hash
  }
}
```

### Votes for Configuration

    GET {basePath}/configs/{config_hash}/votes

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
  "Votes":[  
    vote_for_propose_transaction_body,
    null,
    ...
  ]
}
```

### Committed Configurations

    GET {basePath}/configs/committed?previous_cfg_hash={previous_config_hash}&actual_from={lowest_actual_from}

Looks up all committed configurations in the order configuration proposals are
committed as transactions to the Exonum blockchain.

#### Parameters

- `previous_config_hash`: hash (optional)  
  Filters configurations by the specified previous configuration hash.

- `lowest_actual_from`: hash (optional)
  Filters configurations by the specified minimum for the height from which the
  configuration became actual.

#### Response template

```JSON
[
  {  
    "config":config_body,
    "hash":config_hash
  },
  {  
    "config":config_body,
    "hash":config_hash
  },
  ...
]
```

### Proposed Configurations

    GET {basePath}/configs/proposed?previous_cfg_hash={config_hash}&actual_from={lowest_actual_from}

Looks up all proposed configurations in the order configuration proposals are
committed as transactions to the Exonum blockchain.

#### Parameters

`previous_cfg_hash` and `lowest_actual_from` are optional filtering parameters.
**propose_template** is included in response if its _previous_cfg_hash_ field
equals the corresponding parameter. It's included if its _actual_from_ field is
greater or equal than corresponding parameter.

#### Response template

```JSON
[  
  {  
    "propose-data":propose_template,
    "hash":config_hash
  },
  {  
    "propose-data":propose_template,
    "hash":config_hash
  },
  ...
]
```

### Private endpoints

Posting a new configuration can be performed by any validator maintainer via private
endpoint.

`cfg_hash`, returned in response to `postpropose` request, should be used as
`config_hash_vote_for` parameter of `postvote` request.

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

     1. no vote from the same node's public key has been submitted previously.

### Propose Configuration

    POST {basePath}/configs/postpropose

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

    POST {basePath}/configs/{config_hash_vote_for}/postvote

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
[http_api]: https://github.com/exonum/exonum-configuration/blob/master/doc/testnet-api-tutorial.md#global-variable-service-http-api
[response_samples]: https://github.com/exonum/exonum-configuration/blob/master/doc/response-samples.md
