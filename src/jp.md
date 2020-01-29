# Exonum

**Exonum**は、ブロックチェーンを使ったアプリケーションを作成するための拡張可能なオープンソースフレームワークです。
Exonumを使用することで、FinTech、GovTech、LegalTechなどの問題のある箇所で、暗号化された分散型ネットワークを構築できます。
Exonumフレームワークは、すでに許可されているブロックチェーン、つまりブロックチェーンインフラストラクチャプロバイダのブロックチ
ェーン構築に向いているものです。

Exonumは[Rust][rust]というプログラミング言語を使用して安全性を最大限に高めます。拡張性、柔軟性、
[モジュールを提供するためのサービス指向の設計][wiki:soa]、システムとクライアント間の透明性を確保するための暗号化メソッド
（MerkleおよびMerkle Patriciaツリー）またそれに基づくクライアント側の検証機能が含まれます。

## 始めてみましょう

### インストール

オープンソースのRustライブラリにて[Exonum][core]フレームワークのコア機能を提供しています。このオープンソースは
[Apache 2.0][apache]ライセンスの下で利用可能です。[ライブラリをインストールするには](get-started/install.md)、
インストールガイドを参照してください。

### 仮想通貨のチュートリアル

[仮想通貨のチュートリアルでは](get-started/create-service.md)、
Exonumを使用して簡単な仮想通貨アプリケーションを構築する方法を順を追って紹介します。
それ以外でも、このチュートリアルでは、[クライア][client]ント側がブロックチェーン情報の検証と暗号操作（デジタル署名など）
を目的としたJavaScriptライブラリも同時に使用しています。

チュートリアルで使用するソースコードは[GitHub][tutorial]で入手できます。

## さらに詳しく

### フレームワークの設計とモチベーション

ブロックチェーンフレームワークを構築するモチベーーションについては、
[「Exonumとは何か」](get-started/what-is-exonum.md)を参照してください。
デザインの外観はより技術的な手段をとり、[詳細なExonum](get-started/design-overview.md)デザインの説明を提供します。

### サービス＆クライアント

これから紹介する2つのトピックでは、Exonumで開発する方法について良い方法を紹介しています。

- [サービスは](architecture/services.md)Exonum設計のメインの設計ブロックになります。
- [ライトクライア](architecture/clients.md)ントは第三者のアプリケーションが作成したサービスとやり取りする主な方法です。

!!! 豆知識
    実際のExonumを使用したサービス例については、「Exonumのサービス」を参照してください。

### 仕様

Exonumのドキュメントには、[シリアル化](architecture/serialization.md)、[ストレージ](architecture/merkledb.md)、
[ネットワークについて等](advanced/network.md)、フレームワークやその他様々な側面に関する詳細な説明が含まれています。

## 貢献・寄付する

[Exonumの開発に貢献](contributing.md)・寄付する方法についての情報を得るにはガイドを参照するか、
[ロードマップ](roadmap.md)を参照して、近いうちにどの機能が実装・登場するかを確認してください。

[rust]: http://rust-lang.org/
[wiki:soa]: https://en.wikipedia.org/wiki/Service-oriented_architecture
[wiki:commitment]: https://en.wikipedia.org/wiki/Commitment_scheme
[core]: http://github.com/exonum/exonum/
[apache]: https://opensource.org/licenses/Apache-2.0
[client]: https://github.com/exonum/exonum-client
[tutorial]: https://github.com/exonum/exonum/blob/master/examples/cryptocurrency
[anchoring]: https://github.com/exonum/exonum-btc-anchoring/
[config]: https://github.com/exonum/exonum/tree/master/services/configuration
