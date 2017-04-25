# Step 4: Wallet interface

---

### Wallet interface markdown

Create `wallet.tag`:

```html
<wallet>
    <div class="panel-heading">
        <button class="btn btn-default pull-right page-nav" onclick={ refresh }>
            <i class="glyphicon glyphicon-refresh"></i>
            <span class="hidden-xs">Refresh</span>
        </button>
        <button class="btn btn-default pull-left page-nav" onclick={ logout }>
            <i class="glyphicon glyphicon-log-out"></i>
            <span class="hidden-xs">Logout</span>
        </button>
        <div class="panel-title page-title text-center">
            <div class="h4">Wallet</div>
        </div>
    </div>
    <div class="panel-body">
        <virtual if="{ wallet && block }">
            <wallet-summary wallet={ wallet } block={ block }></wallet-summary>
        </virtual>
    </div>

    <script>
        refresh(e) {
            e.preventDefault();
            window.location.reload();
        }

        logout(e) {
            e.preventDefault();
            self.auth.logout();
        }
    </script>
</wallet>
```

Wallet summary is moved into separate tag to be reusable. Create `wallet-summary.tag`:

```html
<wallet-summary>
    <p class="text-center">Here is your wallet's details:</p>
    <div class="custom-dd">
        <div class="row">
            <div class="col-xs-6 custom-dd-column">
                <strong>Name</strong>
            </div>
            <div class="col-xs-6 custom-dd-column">
                { opts.wallet.name }
            </div>
        </div>
        <div class="row">
            <div class="col-xs-6 custom-dd-column">
                <strong>Public key</strong>
            </div>
            <div class="col-xs-6 custom-dd-column">
                <truncate class="truncate" val={ opts.wallet.pub_key }></truncate>
            </div>
        </div>
        <div class="row">
            <div class="col-xs-6 custom-dd-column">
                <strong>Balance</strong>
            </div>
            <div class="col-xs-6 custom-dd-column">
                { opts.wallet.balance }
            </div>
        </div>
        <div class="row">
            <div class="col-xs-6 custom-dd-column">
                <strong>Time</strong>
            </div>
            <div class="col-xs-6 custom-dd-column">
                { opts.block.time }
            </div>
        </div>
        <div class="row">
            <div class="col-xs-6 custom-dd-column">
                <strong>Block</strong>
            </div>
            <div class="col-xs-6 custom-dd-column">
                <a href="#blockchain/block/{ opts.block.height }">{ opts.block.height }</a>
            </div>
        </div>
    </div>
</wallet-summary>
```

---

### Set up route

Add route into `app.tag`:

```javascript
route('/user', function() {
    riot.mount('#content', 'wallet');
});
```

---

### TODO: Load wallet

add cryptocurrency logic to render wallet page (parsing of block with precommits)

do we need big-integer dependency here?

---

### Format time

To beautify time use [Moment.js](http://momentjs.com/). Install it using `bower`:

```
$ bower install moment --save
```

Include it into `index.html`:

```html
<script src="bower_components/moment/min/moment.min.js"></script>
```

Now time can be formatted as:

```html
{ moment(time / 1000000).fromNow() } // a few seconds ago
```

---

### Format numbers

To beautify numbers such as balances use [Numeral.js](http://numeraljs.com/). Install it using `bower`:

```
$ bower install numeral --save
```

Include it into `index.html`:

```html
<script src="bower_components/numeral/min/numeral.min.js"></script>
```

Now balances can be formatted as:

```html
{ numeral(balance).format('$0,0.00') } // $1,024.00
```

---

### Wallet transactions

To render list of transaction insert next code into `wallet.tag` after `<wallet-summary>` tag including:

```html
...
<virtual if={ transactions }>
    <legend class="text-center no-border space-top">Transactions history</legend>

    <div class="custom-table">
        <div class="row">
            <div class="col-xs-4 custom-table-header-column">Hash</div>
            <div class="col-xs-5 custom-table-header-column">Description</div>
            <div class="col-xs-3 custom-table-header-column text-center">Status</div>
        </div>
        <div class="row" each={ transactions }>
            <div class="col-xs-4 custom-table-column">
                <truncate val={ hash }></truncate>
            </div>
            <div class="col-xs-5 custom-table-column" if={ message_id === 130 }>
                Create wallet
            </div>
            <div class="col-xs-5 custom-table-column" if={ message_id === 129 }>
                Add <strong>{ numeral(body.amount).format('$0,0.00') }</strong> to your wallet
            </div>
            <div class="col-xs-5 custom-table-column" if={ message_id === 128 && body.from === parent.publicKey }>
                Send <strong>{ numeral(body.amount).format('$0,0.00') }</strong> to <truncate val={ body.to }></truncate>
            </div>
            <div class="col-xs-5 custom-table-column" if={ message_id === 128 && body.to === parent.publicKey }>
                Receive <strong>{ numeral(body.amount).format('$0,0.00') }</strong> from <truncate val={ body.from }></truncate>
            </div>
            <div class="col-xs-3 custom-table-column text-center">
                <i if={ status } class="glyphicon glyphicon-ok text-success"></i>
                <i if={ !status } class="glyphicon glyphicon-remove text-danger"></i>
            </div>
        </div>
    </div>
</virtual>
...
```

Now assign `transactions` array inside `getWallet` callback:

```javascript
this.service.getWallet(self.opts.publicKey, function(block, wallet, transactions) {
    ...
    self.transactions = transactions;
    ...
});
```

---

Next step: [Transactions interfaces →](step-5-transactions.md)
