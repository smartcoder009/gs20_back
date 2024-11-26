const mongoose = require('mongoose');

let disputeSchema = new mongoose.Schema({
  "buyorderId"   : {type:mongoose.Schema.Types.ObjectId, ref:'p2p_coin_order', index:true},
  "sellorderId"  : {type:mongoose.Schema.Types.ObjectId, ref:'p2p_coin_order', index:true},
  "buyerUserId"  : {type:mongoose.Schema.Types.ObjectId, ref:'user_info', index:true},
  "sellerUserId" : {type:mongoose.Schema.Types.ObjectId, ref:'user_info', index:true},
  "buy_status"   : String,
  "sell_status"  : String,
  "buy_order"    : String,
  "sell_order"   : String,
  "from_symbol"  : String,
  "to_symbol"    : String,
  "pair"         : String,
  "amount"       : Number,
  "price"        : Number,
  "proof"        : String,
  "status"       : {type:Number, default:0},
  "remarks"      : String,
  "created_at"   : {type:Date, default:Date.now},
  "updated_at"   : {type:Date, default:Date.now}
}, {"versionKey" : false});

module.exports = mongoose.model('p2p_dispute', disputeSchema, 'p2p_dispute');