const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let currencySchema = new Schema({
  "name"             : String,
  "symbol"           : String,
  "unified_cryptoasset_id"    :  Number,
  "image"            : {type: String, default: ""},
  "type"             : {type: String, default: "coin"},
  "status"           : {type: Number, default: 1 },
  "min_deposit"      : {type: Number, default: 0 }, 
  "max_deposit"      : {type: Number, default: 0 },
  "min_withdraw"     : {type: Number, default: 0 },
  "max_withdraw"     : {type: Number, default: 0 }, 
  "withdraw_fee"     : {type: Number, default: 0 },
  "deposit_status"   : {type: Number, default: 1 },
  "withdraw_status"  : {type: Number, default: 1 },
  "btc_price"        : {type: Number, default: 0 },
  "usd_price"        : {type: Number, default: 0 },
  "change"           : { type:Number, default:0 },
  "volume"           : { type:Number, default:0 },
  "high"             : { type:Number, default:0 },
  "low"              : { type:Number, default:0 },
  "networks"         : [{"name":String, "address":String, "memo":String, "status":Number, "memo_status":Number, "mainwallet" : { type: String, default: ''}}],
  "created_at"       : {type: Date, default: Date.now },
  "updated_at"       : {type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('currency', currencySchema, 'currency');