const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let blogSchema = new Schema({
  "title": String,
  "content": String,
  "description": String,
  "pagekey": String,
  "news_image": String,
  "blog_pic": String,
  "status" : {type: Number, default: 1}, // 1- active 0 - deactive
  "created_at": { type: Date, default: Date.now },
  "updated_at": { type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('blog', blogSchema, 'blog');

