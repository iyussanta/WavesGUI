(function () {
    'use strict';

    /**
     * @param $scope
     * @param $mdDialog
     * @param {AssetsService} assetsService
     * @param {Base} Base
     * @param {app.utils} utils
     * @param {app.utils.apiWorker} apiWorker
     * @param {User} user
     * @param {EventManager} eventManager
     * @return {AssetSendCtrl}
     */
    const controller = function ($scope, $mdDialog, assetsService, Base, utils, apiWorker, user, eventManager) {

        class AssetSendCtrl extends Base {

            get asset() {
                if (!this.assetList || !this.assetList.length) {
                    return null;
                }
                return tsUtils.find(this.assetList, { id: this.assetId });
            }


            /**
             * @param {string} assetId
             * @param {string} mirrorId
             * @param {boolean} canChooseAsset
             */
            constructor(assetId, mirrorId, canChooseAsset) {
                super($scope);

                this.observe('amount', this._onChangeAmount);
                this.observe('amountMirror', this._onChangeAmountMirror);
                this.observe('assetId', this._onChangeAssetId);

                this.step = 'send';
                /**
                 * @type {boolean}
                 */
                this.canChooseAsset = !assetId || canChooseAsset;
                /**
                 * @type {string}
                 */
                this.mirrorId = mirrorId;
                /**
                 * @type {string}
                 */
                this.recipient = '';
                /**
                 * @type {IFeeData}
                 */
                this.feeData = null;

                if (this.canChooseAsset) {
                    this.createPoll(assetsService.getBalanceList, this._setAssets, 1000);
                } else {
                    this.createPoll(this._getAsset, this._setAssets, 1000);
                }
                /**
                 * @type {string}
                 */
                this.assetId = assetId || WavesApp.defaultAssets.WAVES;
            }

            send() {
                if (this.step === 'send') {
                    this.step = 'confirm';
                } else {
                    user.getSeed()
                        .then((data) => {
                            return apiWorker.process((WavesApi, data) => {
                                return WavesApi.API.Node.v1.assets.transfer({
                                    assetId: data.assetId,
                                    recipient: data.recipient,
                                    amount: data.amount
                                }, data.keyPair);
                            }, {
                                assetId: this.assetId,
                                recipient: this.recipient,
                                keyPair: data.keyPair,
                                amount: this.amount * Math.pow(10, this.asset.precision)
                                    .toFixed(this.asset.precision)
                            });
                        })
                        .then((data) => {
                            eventManager.addEvent({
                                type: eventManager.getAvailableEvents().transfer,
                                data: {
                                    id: data.id,
                                    amount: { ...this.asset, balance: this.amount }
                                }
                            });
                            $mdDialog.hide();
                        });
                }
            }

            fillMax() {
                if (this.asset.id === this.feeData.id) {
                    if (this.asset.balance >= this.fee) {
                        this.amount = this.asset.balance - this.feeData.fee;
                    }
                } else {
                    this.amount = this.asset.balance;
                }
            }

            cancel() {
                $mdDialog.cancel();
            }

            onReadQrCode(result) {
                this.recipient = result;
            }

            _onChangeAssetId() {
                if (!this.assetId) {
                    return null;
                }
                this.ready = utils.when(Promise.all([
                    assetsService.getAssetInfo(this.assetId),
                    assetsService.getAssetInfo(this.mirrorId),
                    assetsService.getFeeSend()
                ]))
                    .then((data) => {
                        const [asset, mirror, feeData] = data;
                        this.amount = 0;
                        this.amountMirror = 0;
                        this.feeAlias = 0;
                        this.mirror = mirror;
                        this.feeData = feeData;
                        if (!this.assetList) {
                            this.assetList = [asset];
                        }

                        this.fee = feeData.fee;
                        this._getRate()
                            .then((api) => {
                                this.feeAlias = api.exchange(this.fee);
                            });
                    });
            }

            /**
             * @returns {Promise.<IAssetWithBalance>}
             * @private
             */
            _getAsset() {
                return assetsService.getBalance(this.assetId);
            }

            /**
             * @param {IAssetWithBalance|IAssetWithBalance[]} assets
             * @private
             */
            _setAssets(assets) {
                this.assetList = utils.toArray(assets);
                if (!this.assetId) {
                    this.assetId = this.assetList[0].id;
                }
            }

            /**
             * @private
             */
            _onChangeAmount() {
                this.amount && this._getRate()
                    .then((api) => {
                        if (api.exchangeReverse(this.amountMirror) !== this.amount) {
                            this.amountMirror = api.exchange(this.amount);
                        }
                    });
            }

            /**
             * @private
             */
            _onChangeAmountMirror() {
                this.amountMirror && this._getRate()
                    .then((api) => {
                        if (api.exchange(this.amount) !== this.amountMirror) {
                            this.amount = api.exchangeReverse(this.amountMirror);
                        }
                    });
            }

            /**
             * @returns {Promise.<AssetsService.rateApi>}
             * @private
             */
            _getRate() {
                return assetsService.getRate(this.asset.id, this.mirror.id);
            }

        }

        return new AssetSendCtrl(this.assetId, this.baseAssetId, this.canChooseAsset);
    };

    controller.$inject = [
        '$scope',
        '$mdDialog',
        'assetsService',
        'Base',
        'utils',
        'apiWorker',
        'user',
        'eventManager'
    ];

    angular.module('app.utils')
        .controller('AssetSendCtrl', controller);
})();
