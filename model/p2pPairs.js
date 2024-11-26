var mongoose = require('mongoose');

var pairsSchema = new mongoose.Schema({
  "from_symbol"  : { type:String, index:true },
  "to_symbol"    : { type:String, index:true },
  "pair_name"    : { type:String, index:true },
  "status"       : { type:Number, default:1 },
  "fee_per"      : Number,
  "last_price"   : Number,
  "min_amt"      : Number,
  "max_amt"      : Number,
  "min_price"    : Number,
  "max_price"    : Number,
  "decimal"      : Number,
  "amt_decimal"  : Number,
  "created_at"   : { type:Date, default:Date.now },
  "updated_at"   : { type:Date, default:Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('p2p_pairs', pairsSchema, 'p2p_pairs')