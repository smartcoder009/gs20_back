var mongoose = require('mongoose');

var tempSchema = new mongoose.Schema({
  "sellorderId"    : { type:mongoose.Schema.Types.ObjectId, ref:'p2p_coin_order', index:true },
  "sellerUserId"   : { type:mongoose.Schema.Types.ObjectId, ref:'user_info', index:true },
  "askAmount"      : Number,
  "askPrice"       : Number,
  "firstCurrency"  : { type:String, index:true },
  "secondCurrency" : { type:String, index:true },
  "filledAmount"   : { type:Number, default:0 },
  "buyorderId"     : { type:mongoose.Schema.Types.ObjectId, ref:'p2p_coin_order', index:true },
  "buyerUserId"    : { type:mongoose.Schema.Types.ObjectId, ref:'user_info', index:true },
  "total"          : Number,
  "buy_fee"        : Number,
  "sell_fee"       : Number,
  "pair"           : String,
  "cancel_id"      : { type:String, default:null },
  "cancel_order"   : { type:String, default:"" },
  "buy_order"      : { type:String, default:"" },
  "sell_order"     : { type:String, default:"" },
  "seller_status"  : { type:String, default:"inactive" },
  "buyer_status"   : { type:String, default:"inactive" },
  "created_at"     : { type:Date, default:Date.now }
}, {"versionKey" : false});
module.exports = mongoose.model('p2p_ordertemp', tempSchema, 'p2p_ordertemp')