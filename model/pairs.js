var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var pairsSchema = new Schema({
  "from_symbol"  : String,
  "to_symbol"    : String, 
  "trade_fee"    : Number,
  "last_price"   : Number,
  "min_amt"      : Number,
  "status"       : { type:Number, default:1 },
  "price_range"  : Number,
  "change_per"   : { type:Number, default:0 },
  "volume"       : { type:Number, default:0 },
  "amt_volume"   : { type:Number, default:0 },
  "high"         : { type:Number, default:0 },
  "low"          : { type:Number, default:0 },
  "prc_clr"      : { type:Number, default:0 },
  "decimal"      : Number, 
  "amt_decimal"  : Number, 
  "swap_status"  : { type:Number, default:0 },
  "swap_min"     : Number,
  "swap_max"     : Number,
  "fee_type"     : String,
  "swap_fee"     : { type:Number, default:0 },
  "markup"       : Number,
  "liquidity"    : { type:Number, default:0 },
  "created_at"   : { type:Date, default:Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('trade_pairs', pairsSchema, 'trade_pairs')