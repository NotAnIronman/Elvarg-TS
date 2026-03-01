 
import { ShopCurrency } from "./ShopCurrency";
import { CoinsCurrency } from "./impl/CoinsCurrency";
import { BloodMoneyCurrency } from "./impl/BloodMoneyCurrency";
import { PointsCurrency } from './impl/PointsCurrency';

export class ShopCurrencies {

    public static readonly COINS = (new CoinsCurrency());
    public static readonly BLOOD_MONEY = (new BloodMoneyCurrency());
    public static readonly POINTS = (new PointsCurrency());

    public readonly currency: ShopCurrency;

    constructor (currency: ShopCurrency) {
        this.currency = currency;
    }

    public get(): ShopCurrency{
        return this.currency;
    }
}
