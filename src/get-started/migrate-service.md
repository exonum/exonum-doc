# Data Migration Tutorial

In this tutorial, we look into transforming a
[simple cryptocurrency service](create-service.md) into an
[advanced one](data-proofs.md) so that the user data is preserved.
This demonstrates one of the key features of the Exonum framework:
first-class [service lifecycle](../architecture/service-lifecycle.md).

!!! tip
    The migration logic is embedded into the [source code][demo]
    of the advanced cryptocurrency service.

## How Service Migration Works

First, a brief overview of service migrations. The goal of a migration
is to update the business logic of the service, for example,
in order to add new functionality (such as new transaction types or
new API endpoints), fix a bug or update service dependency.
Not all migrations are limited to the updates of the service logic, though.
In some cases, we would like to transform service data as well.
Such [data migrations](../architecture/services.md#data-migrations)
can be robustly executed by Exonum so that every node in the blockchain network
arrives at the same migrated data in time before the migrated data is used.

Transition from a simple cryptocurrency service to an advanced one
requires data migration since the data layout of the advanced service
has evolved significantly:

- The advanced service uses [Merkelized data collections](../glossary.md#merkle-tree)
- History of activity is stored for each account
- [Addresses](../advanced/service-interaction.md#authorization-via-services)
  are used instead of public keys to identify accounts

Without data migration mechanism, it would be necessary to support
the legacy data separately (thus bloating the codebase and reducing maintainability),
hard-code it into service initialization,
or abandon it altogether. Migration provides a swift solution to this problem.

## Writing Migration Script

Data migrations consist of one or more [migration scripts](../glossary.md#migration-script),
which are atomically applied to the blockchain state on each node.
(Before the script is applied, the [supervisor service](../advanced/supervisor.md)
checks that the script outcome is the same on all nodes.)

In our case, there is a single script which performs the transforms
mentioned previously. Notably, this script is universal, that is, works
on any data producible by the simple service.

!!! tip
    The migration logic is placed in the [`migrations` module][migrations-mod]
    of the service crate.

### Transforming Wallet

First, let’s define the transform for a single wallet:

```rust
// Import schema types from the old service crate.
use old_cryptocurrency::schema::{
    CurrencySchema as OldSchema,
    Wallet as OldWallet,
};

fn convert_wallet(old_wallet: OldWallet) -> Wallet {
    Wallet {
        owner: CallerAddress::from_key(old_wallet.pub_key),
        name: old_wallet.name,
        balance: old_wallet.balance,
        history_len: 0,
        history_hash: Hash::zero(),
    }
}
```

Since the old service did not collect account history, we have no choice
other than to initialize it from scratch. Otherwise, the new `Wallet`
structure is filled from the contents of `OldWallet`.

### Iterating Over Wallets

Next, we define a procedure to migrate the entire `wallets` index
of the old service. Conceptually, this is quite simple: we need to
iterate over all wallets in the index and place each of them to
the `wallets` index of the new service.

The real migration script looks more complex:

```rust
pub fn migrate_wallets(
    context: &mut MigrationContext,
) -> Result<(), MigrationError> {
    const CHUNK_SIZE: usize = 100;

    context.helper.iter_loop(|helper, iters| {
        let old_schema = OldSchema::new(helper.old_data());
        let mut new_schema = SchemaImpl::new(helper.new_data());

        let wallets = iters.create("wallets", &old_schema.wallets);
        for (_, old_wallet) in wallets.take(CHUNK_SIZE) {
            let new_wallet = convert_wallet(old_wallet);
            let addr = new_wallet.owner;
            new_schema.public.wallets.put(&addr, new_wallet);
        }
    })?;
    Ok(())
}
```

While it is technically possible to *just* loop over all wallets,
this would not satisfy two requirements on migration scripts:

- The script should make progress in the presence of faults
  (that is, if the node executing the script shuts down for whatever reason).
  With the strawman approach, the script would just be started from scratch.
- The script should be abortable; if the supervisor service decides
  that the migration should be aborted (for example, because the outcomes
  differ on some nodes), the migration script should quickly terminate
  on every node.

To satisfy these requirements, [MerkleDB](../architecture/merkledb.md#migrations)
provides [`iter_loop`][iter_loop], a method that encapsulates
a persistent iterator and automated data persistence / abort check
at the end of each iteration. Thus, no progress is lost on node restart,
and the script is aborted as soon as the next iteration is finished.

Within `iter_loop`, we create a single persistent iterator
named `"wallets"` from the corresponding old schema index, and
process `CHUNK_SIZE` wallets from it on each iteration (this portioning
is implemented via standard [`Iterator::take` method][iter_take]).

`iter_loop` is done when all persistent iterators instantiated within it
have run out of items; in our case, this happens when all wallets are processed.
At this point, the migration is finished.

### Declaring Data Migrations

Finally, we declare data migrations for the (advanced) cryptocurrency service.
As it is a custom in Rust, this is done by implementing the corresponding trait
for the service:

```rust
impl MigrateData for CryptocurrencyService {
    fn migration_scripts(
        &self,
        start_version: &Version,
    ) -> Result<Vec<MigrationScript>, InitMigrationError> {
        let latest_version = self.artifact_id().version;
        LinearMigrations::new(latest_version)
            .add_script(Version::new(0, 2, 0), migrate_wallets)
            .select(start_version)
    }
}
```

`LinearMigrations` type allows to choose which script(s) to execute
given the initial service version.
The provided migration scripts are associated with a semantic version
for the service data after migration. In our case, we have a single script,
which we’ve just defined; it is associated with version 0.2.0.

## Testing Migrations

As it is the case with other service interfaces, migration scripts
should be well-tested. The [testkit](test-service.md) provides a tool
to test migration scripts *in isolation* (that is, without emulating
the entire service workflow necessary to start a migration).
This functionality is located in the [`migrations` module][testkit-migrations]
of the testkit.

The basic workflow for migration tests is simple:

1. Prepare test data for the older service. This data can be hand-written
  or generated randomly (perhaps, using [property testing] tools).
2. Apply the migration script to the data.
3. Check that the data is transformed as expected.

The testing code for our migration is located in [`migration::tests` module][migrations-test-mod].
Helpers for stages 1 and 3 are defined as follows:

??? "Preparing old service data"

    ```rust
    fn prepare_wallets<'a, T>(
        fork: T,
        wallets: impl Iterator<Item = (&'a str, u64)>,
    ) where
        T: Access,
        T::Base: RawAccessMut,
    {
        let mut schema = OldSchema::new(fork);
        for (name, balance) in wallets {
            let pub_key = name_to_keypair(name).public_key();
            let wallet = OldWallet {
                pub_key,
                name: name.to_owned(),
                balance,
            };
            schema.wallets.put(&pub_key, wallet);
        }
    }
    ```

??? "Checking transformed data"

    ```rust
    fn assert_state<'a>(
        schema: &SchemaImpl<impl Access>,
        wallets: impl Iterator<Item = (&'a str, u64)>,
    ) {
        let mut expected_wallet_count = 0;
        for (name, balance) in wallets {
            let pub_key = name_to_keypair(name).public_key();
            let addr = CallerAddress::from_key(pub_key);
            let wallet = schema.public.wallets.get(&addr).unwrap();
            expected_wallet_count += 1;

            assert_eq!(wallet.name, name);
            assert_eq!(wallet.balance, balance);
            assert_eq!(wallet.owner, addr);
        }

        assert_eq!(
            schema.public.wallets.iter().count(),
            expected_wallet_count
        );
    }
    ```

In the following test, we create an old schema with three wallets
and test that after applying the `prepare_wallets` script these wallets
(and nothing else) are present in the new schema:

```rust
#[test]
fn isolated_test_with_handwritten_data() {
    let wallets = &[("alice", 75), ("bob", 120), ("carol", 3)];

    let old_version = OldService.artifact_id().version;
    let mut test = MigrationTest::new(CryptocurrencyService, old_version);
    test.setup(|fork| prepare_wallets(fork, wallets.iter().copied()));

    let schema = SchemaImpl::new(test.migrate().end_snapshot());
    assert_state(&schema, wallets.iter().copied());
}
```

Tests with randomly generated data are structured similarly;
`wallets` structure just needs to be filled randomly instead of being
hard-coded.

### Integration Testing

High-level migration testing is possible via [`exonum-launcher`][exonum-launcher]:

1. Instantiate the old service using the launcher.
2. Send transactions to the old service to generate data for migration.
3. Stop or freeze the service.
4. Launch migration via the supervisor.
5. After the migration is complete, resume the new service and check
  the new service state via API.

See the [integration tests] in the Exonum repository for a reference.

[demo]: https://github.com/exonum/exonum/tree/master/examples/cryptocurrency-advanced
[migrations-mod]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency-advanced/backend/src/migrations/mod.rs
[iter_loop]: https://docs.rs/exonum-merkledb/1.0.0/exonum_merkledb/migration/struct.MigrationHelper.html#using-persistent-iterators
[iter_take]: https://doc.rust-lang.org/std/iter/trait.Iterator.html#method.take
[testkit-migrations]: https://docs.rs/exonum-testkit/1.0.0/exonum_testkit/migrations/index.html
[migrations-test-mod]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency-advanced/backend/src/migrations/tests.rs
[property testing]: https://altsysrq.github.io/proptest-book/intro.html
[exonum-launcher]: https://github.com/exonum/exonum-launcher
[integration tests]: https://github.com/exonum/exonum/blob/master/test-suite/exonum-py-tests/exonum_tests/migrate.py
