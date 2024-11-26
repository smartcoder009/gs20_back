var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var tempSchema = new Schema({
  "sellorderId"    : { type:mongoose.Schema.Types.ObjectId, ref:'coin_order' },
  "sellerUserId"   : {type: mongoose.Schema.Types.ObjectId, ref: 'user_info'},
  "askAmount"      : Number,
  "askPrice"       : Number,
  "firstCurrency"  : String,
  "secondCurrency" : String,
  "filledAmount"   : { type:Number, default:0 },
  "buyorderId"     : { type:mongoose.Schema.Types.ObjectId, ref:'coin_order' },
  "buyerUserId"    : {type: mongoose.Schema.Types.ObjectId, ref: 'user_info'},
  "total"          : Number,
  "buy_fee"        : Number,
  "sell_fee"       : Number,
  "pair"           : String,
  "cancel_id"      : { type:String, default:null },
  "cancel_order"   : { type:String, default:"" },
  "datetime"       : { type:Date, default:Date.now },
  "created_at"     : { type:Date, default:Date.now },
  "buyername"      : { type:String, default:"" },
  "sellername"     : { type:String, default:"" }
}, {"versionKey" : false});
module.exports = mongoose.model('ordertemp', tempSchema, 'ordertemp')