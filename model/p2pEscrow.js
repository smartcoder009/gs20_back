const mongoose = require('mongoose');

let escrowSchema = new mongoose.Schema({
  "sellorderId"  : {type:mongoose.Schema.Types.ObjectId, ref:'p2p_coin_order', index:true},
  "sellerUserId" : {type:mongoose.Schema.Types.ObjectId, ref:'user_info', index:true},
  "amount"       : Number,
  "currency"     : {type:String, index:true},
  "pair"         : {type:String, index:true},
  "sell_status"  : String,
  "buy_status"   : String,
  "remarks"      : String,
  "proof"        : String,
  "buyorderId"   : {type:mongoose.Schema.Types.ObjectId, ref:'p2p_coin_order', index:true},
  "buyerUserId"  : {type:mongoose.Schema.Types.ObjectId, ref:'user_info', index:true},
  "created_at"   : {type:Date,  default:Date.now},
  "updated_at"   : {type:Date,  default:Date.now}
},{"versionKey"  : false});

module.exports = mongoose.model('p2p_escrow', escrowSchema, 'p2p_escrow');