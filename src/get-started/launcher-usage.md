# Exonum Launcher Tutorial: Manage Service Life Cycle

The goal of the tutorial is to demonstrate how to use [exonum-launcher][exonum-launcher] utility
to manage service life cycle. The tutorial contains following parts:

- compile and install the service and exonum-launcher utility
- generate configs and start nodes
- send transactions
- deploy a new version of the service artifact
- stop the service with older version
- migrate data and business logic to newer version of the service
- start the service with newer version
- unload an artifact of older version

In this tutorial we are going to use `cryptocurrency-migration` example based on the
[cryptocurrecny-advanced][cryptocurrency-advanced] service. The example contains a script for
migration inside and two artifacts of the `cryptocurrency` service with versions 0.1.0 and 0.2.0
accordingly. The service with version `0.1.0` is already pre-deployed so we don't need to make any
manipulations to deploy and start it. More detailed description about service life cycles you can
find at this [tutorial](../architecture/service-lifecycle.md). 

### Compile and install the service and exonum-launcher utility

First, we need to compile and install a node binary file with a service:

```bash
git clone --branch v1.0.0 https://github.com/exonum/exonum
cargo install --path exonum/examples/cryptocurrency-advanced/backend --example cryptocurrency-migration
```
If you'll get any error while installing a node possibly you need to install required dependencies.
[Installation guide](install.md) demonstrates how to do this.

Installing `exonum-launcher` requires `python3` and `pip3` accordingly. If these packages present we
need to run this command:

```bash
pip3 install exonum-launcher --no-binary=protobuf protobuf
``` 

### Generate configs and start nodes

First, we need to generate a config template file:

```bash
cryptocurrency-migration generate-template template.toml --validators-count 4 --supervisor-mode simple
```
- `template.toml` config template file
- `--validators-count` number of validators in the network
- `--supervisor-mode` type of supervisor mode

At this stage we generate public and private configs for every node:

```bash
cryptocurrency-migration generate-config template.toml 1 --peer-address 127.0.0.1:8081 -n
cryptocurrency-migration generate-config template.toml 2 --peer-address 127.0.0.1:8082 -n
cryptocurrency-migration generate-config template.toml 3 --peer-address 127.0.0.1:8083 -n
cryptocurrency-migration generate-config template.toml 4 --peer-address 127.0.0.1:8084 -n
```
- `template.toml` - config template file we've generate at the first stage
- `{1,2,3,4}` - directories where configs will be saved for every node
- `--peer-address` - ip address and port of the node used for communications between nodes
- `-n` - means do not prompt for passwords when generating private keys

Next, we need to finalize configs for every node:

```bash
cryptocurrency-migration finalize 1/sec.toml 1/config.toml --public-configs {1,2,3,4}/pub.toml
cryptocurrency-migration finalize 2/sec.toml 2/config.toml --public-configs {1,2,3,4}/pub.toml
cryptocurrency-migration finalize 3/sec.toml 3/config.toml --public-configs {1,2,3,4}/pub.toml
cryptocurrency-migration finalize 4/sec.toml 4/config.toml --public-configs {1,2,3,4}/pub.toml
```
- `{1,2,3,4}/sec.toml` - private config files of the nodes
- `{1,2,3,4}/config.toml` - config files of the nodes
- `{1,2,3,4}/pub.toml` - list of public config files of the nodes

Now we can run nodes:

```bash
export RUST_LOG=info
cryptocurrency-migration run -d 1/db -c 1/config.toml --public-api-address 127.0.0.1:9081\
 --private-api-address 127.0.0.1:9091 --master-key-pass pass > node1.log 2>&1 &
cryptocurrency-migration run -d 2/db -c 2/config.toml --public-api-address 127.0.0.1:9082\
 --private-api-address 127.0.0.1:9092 --master-key-pass pass > node2.log 2>&1 &
cryptocurrency-migration run -d 3/db -c 3/config.toml --public-api-address 127.0.0.1:9083\
 --private-api-address 127.0.0.1:9093 --master-key-pass pass > node3.log 2>&1 &
cryptocurrency-migration run -d 4/db -c 4/config.toml --public-api-address 127.0.0.1:9084\
 --private-api-address 127.0.0.1:9094 --master-key-pass pass > node4.log 2>&1 &
```

To make sure if the nodes are working we can check with this command:
```bash
curl -s http://127.0.0.1:9091/api/system/v1/info | jq
```

If everything is ok we shall see something like this in the output:

```json
{
  "consensus_status": "active",
  "connected_peers": [
    {
      "address": "127.0.0.1:8082",
      "public_key": "f9fb4360e70f03d2069058c843ed217c6b9a27a8c38893baf0b56428cb55bbc3",
      "direction": "outgoing"
    },
    {
      "address": "127.0.0.1:8083",
      "public_key": "5211b00d4e84e7a523d3377a72bd9be42bac14cab9e0c412f8e8a165947dbe9b",
      "direction": "outgoing"
    },
    {
      "address": "127.0.0.1:53589",
      "public_key": "1ffd9a18dd2949b874e1cd850193f80fe1cd7023dd20f76348a56da3c5732cf4",
      "direction": "incoming"
    }
  ],
  "exonum_version": "1.0.0",
  "rust_version": "1.42.0",
  "os_info": "Mac OS (10.15.4) (64-bit)"
}
```
### Sending transaction

For sending transaction we use a [python light client][exonum-python-client]. It should be already installed 
because `exonum-launcher` depends on it. In this example we will send three transactions:
- create wallet for Alice
- create wallet for Bob
- transfer 10 coins from Alice's wallet to Bob's wallet

```python
from exonum_client import ExonumClient, MessageGenerator, ModuleManager
from exonum_client.crypto import KeyPair

from time import sleep

artifact_name = "exonum-cryptocurrency"
artifact_version = "0.1.0"
instance_name = "cryptocurrency"

client = ExonumClient("localhost", 9081, 9091)

with client.protobuf_loader() as loader:
    loader.load_main_proto_files()
    loader.load_service_proto_files(0, artifact_name, artifact_version)

    types_module = ModuleManager.import_service_module(
        artifact_name, artifact_version, "exonum.crypto.types"
    )
    service_module = ModuleManager.import_service_module(
        artifact_name, artifact_version, "service"
    )

    instance_id = client.public_api.get_instance_id_by_name(instance_name)
    message_generator = MessageGenerator(instance_id, artifact_name, artifact_version)

    # Create wallet for Alice
    alice_keys = KeyPair.generate()

    wallet = service_module.TxCreateWallet()
    wallet.name = "Alice"

    tx = message_generator.create_message(wallet)
    tx.sign(alice_keys)

    response = client.public_api.send_transaction(tx).json()
    print("Alice tx hash: ", response["tx_hash"])

    # Create wallet for Bob
    bob_keys = KeyPair.generate()

    wallet = service_module.TxCreateWallet()
    wallet.name = "Bob"

    tx = message_generator.create_message(wallet)
    tx.sign(bob_keys)

    response = client.public_api.send_transaction(tx).json()
    print("Bob tx hash: ", response["tx_hash"])

    sleep(2) # Wait for commitment of previous transactions

    # Create transfer transaction
    transfer = service_module.TxTransfer()
    transfer.to.CopyFrom(types_module.PublicKey(data=bob_keys.public_key.value))
    transfer.amount = 10
    transfer.seed = 0

    tx = message_generator.create_message(transfer)
    tx.sign(alice_keys)

    response = client.public_api.send_transaction(tx).json()
    print("Transfer tx hash: ", response["tx_hash"])
```

After executing this script we can check created wallets with such command:

```bash
curl -s http://127.0.0.1:9081/api/services/cryptocurrency/v1/wallets | jq
```

An output should be like this but `pub_key`s will be differ:

```json
[
  {
    "pub_key": "58255c4910d13dff61e66d1e64e78154cda0b110ea84d1b542ff1bdb2e70a519",
    "name": "Alice",
    "balance": 90
  },
  {
    "pub_key": "9d61faba61f458e51061103707a8b7da53493eea93b6846cddac92aca2532dc4",
    "name": "Bob",
    "balance": 110
  }
]
```

So. At this point we want to change a structure of the out wallets. We want to add additional fields which will be
storing history length and history hash. To achieve this we need to deploy a new version of the artifact and to
start a service of the new artifact which contains a migration script.

### Deploy a new version of the service artifact

Fist of all let's see what services we already have:

```bash
curl -s http://127.0.0.1:9081/api/services/supervisor/services  | jq '.artifacts'
```

The output should be like this:

```json
[
  {
    "runtime_id": 0,
    "name": "exonum-supervisor",
    "version": "1.0.0"
  },
  {
    "runtime_id": 0,
    "name": "exonum-cryptocurrency",
    "version": "0.1.0"
  },
  {
    "runtime_id": 0,
    "name": "exonum-explorer-service",
    "version": "1.0.0"
  }
]
```

We can see here that a version of the `exonum-cryptocurrency` artifact is `0.1.0`. To deploy a version `0.2.0` we will
use `exonum-launcher`. First we need to create a config file for deployment process. Let's name it `deploy.yml` and
insert such content:

```yaml
networks:
  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9081
    private-api-port: 9091

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9082
    private-api-port: 9092

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9083
    private-api-port: 9093

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9084
    private-api-port: 9094

deadline_height: 10000

artifacts:
  cryptocurrency:
    runtime: rust
    name: "exonum-cryptocurrency"
    version: "0.2.0"
    action: deploy
```

Now we can use `exonum-lancher` to deploy a new artifact:

```bash
python3 -m exonum_launcher -i deploy.yml
```

Check a list of the artifacts:

```bash
curl -s http://127.0.0.1:9081/api/services/supervisor/services  | jq '.artifacts'
```

And the list should be extended with a new artifact with version `0.2.0`:
```json
[
  {
    "runtime_id": 0,
    "name": "exonum-supervisor",
    "version": "1.0.0"
  },
  {
    "runtime_id": 0,
    "name": "exonum-cryptocurrency",
    "version": "0.1.0"
  },
  {
    "runtime_id": 0,
    "name": "exonum-cryptocurrency",
    "version": "0.2.0"
  },
  {
    "runtime_id": 0,
    "name": "exonum-explorer-service",
    "version": "1.0.0"
  }
]
```

### Stop the service with older version



```yaml
networks:
  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9081
    private-api-port: 9091

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9082
    private-api-port: 9092

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9083
    private-api-port: 9093

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9084
    private-api-port: 9094

deadline_height: 10000

artifacts:
  cryptocurrency:
    runtime: rust
    name: "exonum-cryptocurrency"
    version: "0.1.0"
    action: none

instances:
  cryptocurrency:
    artifact: cryptocurrency
    action: stop
```

```bash
curl -s http://127.0.0.1:9081/api/services/supervisor/services | jq .'services[] | select(.spec.name == "cryptocurrency")'
```

```json
{
  "spec": {
    "id": 101,
    "name": "cryptocurrency",
    "artifact": {
      "runtime_id": 0,
      "name": "exonum-cryptocurrency",
      "version": "0.1.0"
    }
  },
  "status": {
    "type": "stopped"
  },
  "pending_status": null
}
```

### Migrate data and business logic to newer version of the service

Migration includes two steps:
1. Data migration.
2. Buisness logic migration. 

Content of the migration config file

```yaml
networks:
  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9081
    private-api-port: 9091

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9082
    private-api-port: 9092

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9083
    private-api-port: 9093

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9084
    private-api-port: 9094

deadline_height: 10000

migrations:
  cryptocurrency:
    runtime: rust
    name: "exonum-cryptocurrency"
    version: "0.2.0"
```

Migrate service data from version 0.1.0 to 0.2.0 

```bash
python3 -m exonum_launcher -i migrate.yml
```

Check the service status:
```bash
curl -s http://127.0.0.1:9081/api/services/supervisor/services | jq .'services[] | select(.spec.name == "cryptocurrency")'
```

```json
{
  "spec": {
    "id": 101,
    "name": "cryptocurrency",
    "artifact": {
      "runtime_id": 0,
      "name": "exonum-cryptocurrency",
      "version": "0.1.0"
    }
  },
  "data_version": "0.2.0",
  "status": {
    "type": "stopped"
  },
  "pending_status": null
}
```

Migrate business logic of the service:

```bash
python3 -m exonum_launcher -i migrate.yml
```

Check the service status:
```bash
curl -s http://127.0.0.1:9081/api/services/supervisor/services | jq .'services[] | select(.spec.name == "cryptocurrency")'
```

```json
{
  "spec": {
    "id": 101,
    "name": "cryptocurrency",
    "artifact": {
      "runtime_id": 0,
      "name": "exonum-cryptocurrency",
      "version": "0.2.0"
    }
  },
  "status": {
    "type": "stopped"
  },
  "pending_status": null
}
```

### Start the service newer version

Resume the service:

Config file for making resume request:
```yaml
networks:
  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9081
    private-api-port: 9091

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9082
    private-api-port: 9092

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9083
    private-api-port: 9093

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9084
    private-api-port: 9094

deadline_height: 10000

artifacts:
  cryptocurrency:
    runtime: rust
    name: "exonum-cryptocurrency"
    version: "0.2.0"
    action: none

instances:
  cryptocurrency:
    artifact: cryptocurrency
    action: resume
```

```bash
python3 -m exonum_launcher -i resume.yml
```

Output:
```
Instance cryptocurrency resumed
```

Check the service status:
```bash
curl -s http://127.0.0.1:9081/api/services/supervisor/services | jq .'services[] | select(.spec.name == "cryptocurrency")'
```

```json
{
  "spec": {
    "id": 101,
    "name": "cryptocurrency",
    "artifact": {
      "runtime_id": 0,
      "name": "exonum-cryptocurrency",
      "version": "0.2.0"
    }
  },
  "status": {
    "type": "active"
  },
  "pending_status": null
}
```

We can see that the service status is active. 

### Unload an artifact of older version

Content of the file `unload.yml`:

```yaml
networks:
  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9081
    private-api-port: 9091

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9082
    private-api-port: 9092

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9083
    private-api-port: 9093

  - host: "127.0.0.1"
    ssl: false
    public-api-port: 9084
    private-api-port: 9094

deadline_height: 10000

artifacts:
  cryptocurrency:
    runtime: rust
    name: "exonum-cryptocurrency"
    version: "0.1.0"
    action: unload
```

```bash
python3 -m exonum_launcher -i unload.yml
```

Output:
```
Artifact 0:exonum-cryptocurrency:0.1.0 -> unload status: succeed
```

```bash
curl -s http://localhost:9081/api/services/supervisor/services  | jq '.artifacts'
```

```json
[
  {
    "runtime_id": 0,
    "name": "exonum-supervisor",
    "version": "1.0.0"
  },
  {
    "runtime_id": 0,
    "name": "exonum-cryptocurrency",
    "version": "0.2.0"
  },
  {
    "runtime_id": 0,
    "name": "exonum-explorer-service",
    "version": "1.0.0"
  }
]
```


[exonum-launcher]: https://github.com/exonum/exonum-launcher
[exonum-python-client]: https://github.com/exonum/exonum-python-client
[cryptocurrency-advanced]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced/backend
