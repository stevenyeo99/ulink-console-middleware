input = db.submissions.find({scanId: 'API-AYA-CL-26034880-01'})

output = {
	"_id" : ObjectId("6ab3c9a0a185eba3dfeebad6"),
	"barcodeId" : "VSQ9N14552",
	"domainId" : "com.ins-link.tpa",
	"amendments" : [ ],
	"channel" : "/claim/apply",
	"clientId" : "com.ins-link.tpa.datapost",
	"companyRefNo" : "COMP_CODE_ULINK",
	"createdAt" : ISODate("2026-09-23T19:44:16.228+07:00"),
	"drafted" : ISODate("2026-09-23T19:44:16.228+07:00"),
	"materials" : [
		"ec4Uw5yawSHi0a6u1sErWzaYeXmI0erDt1puf1VLIpDtaPgWQNbKHxqpj15PqXo5",
		"qOYLs9vguVEYpPaH4AgmmokseKUtk1pbeA9eVh8PZ8laePXGJtddbkhjgc2q3pHj",
		"Cv1PgDZBjm717u6QeVe0HSDWCoxLwAX2zgFBlyScUOkhgUs7ZZaDtozGVkaG1iiP",
		"nvO3d1e474La5aiP4Yx1a3t1wkSe6Eqgv43UumeRQCd2SJzHLZ0zjN0KqTjWDWwL",
		"fAdOfo9QIjpIJAPhx18KCw6virbcm4hM4YXbudNqNk9xi0rCx5NSG83J55LcBPGo",
		"V9g0z6Cnx8myzZ1nyTJWaCMd1z4JTYsduvwXDCj7ECYIREjCp8aX9u0YPYopraaL",
		"46owxUa7fwxjUEWUK8YWw9CytwmZHEvDDGbPVJT2wBUgTPx1UHJ4q5SQ9KZkjNQs"
	],
	"materialsChecksum" : "efd84d13f21587ee9681a1789145fb7c",
	"refProps" : [ ],
	"scanId" : "API-AYA-CL-26034880-01",
	"scannerId" : "ULINK",
	"updated" : ISODate("2026-09-23T19:44:16.230+07:00"),
	"username" : "system"
}


input = db.fs.files.find({filename: 'ec4Uw5yawSHi0a6u1sErWzaYeXmI0erDt1puf1VLIpDtaPgWQNbKHxqpj15PqXo5'})

output = {
	"_id" : ObjectId("6ab3c99f8ac127ed3eaac397"),
	"filename" : "ec4Uw5yawSHi0a6u1sErWzaYeXmI0erDt1puf1VLIpDtaPgWQNbKHxqpj15PqXo5",
	"content_type" : "image/jpeg",
	"metadata" : {
		"mimetype" : "image/jpeg",
		"originalname" : "page-000.jpg",
		"channel" : "/claim/apply",
		"username" : "system",
		"clientId" : "com.ins-link.tpa.datapost",
		"companyRefNo" : "COMP_CODE_ULINK",
		"scannerId" : "ULINK",
		"scanId" : "API-AYA-CL-26034880-01"
	},
	"uploadDate" : ISODate("2026-09-23T19:44:15.544+07:00"),
	"length" : 121719,
	"md5" : "56ad21fd14769719c735f5b49c79e0a1"
}

current api to image preview = https://iasconsole-graph.ulinkmyanmar.com.mm/claim/material/{material}


module.exports.MONGO_USER = 'airead'
module.exports.MONGO_PASS = 'YourStrongPassword'
module.exports.MONGO_URL = 'mongodb://127.0.0.1:23015/inslink?replicaSet=inslink_replica_set&authSource=admin'