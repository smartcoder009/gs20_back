var express = require('express');
var router = express.Router();
let common = require('../../helpers/common');
var fs = require('fs')
let wallet   = require('../../model/userWallet');
let currency = require('../../model/currency');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

var url   = __dirname;
urls  = url.substring(0,url.lastIndexOf("/"));
shortUrl  = urls.substring(0,urls.lastIndexOf("/"));

router.get('/download', function(req, res){
  const file = shortUrl+'/logs/combined.outerr-0.log';
  res.download(file); // Set disposition and send it.
});

router.get('/cleared', function(req, res){
	fs.writeFile(shortUrl+'/logs/combined.outerr-0.log', '', function(){
  	res.json({status:"cleared"}); // Set disposition and send it.
	})
});

module.exports = router;