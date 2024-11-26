var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var orderSchema = new Schema({
  "user_id"        : {type: mongoose.Schema.Types.ObjectId, ref: 'user_info'},
  "Amount"         : Number,
  "Price"          : Number,
  "Type"           : String,
  "ordertype"      : String,
  "Fee"            : Number,
  "fee_per"        : Number,
  "Total"          : Number,
  "stop_price"     : Number,
  "status"         : String,
  "user_type"      : {type: String, default: "user"},
  "site"           : {type: String, default: "gs20"},
  "err"            : {type: String, default: ""},
  "orderId"        : {type: String, default: ""},
  "clientOrder"    : {type: String, default: ""},
  "firstCurrency"  : String,
  "secondCurrency" : String,
  "wallet"         : String,
  "txnid"          : String,
  "created_at"     : { type:Date, default:Date.now },
  "updated_at"     : { type:Date, default:Date.now }
}, {"versionKey" : false});
module.exports = mongoose.model('coin_order', orderSchema, 'coin_order')