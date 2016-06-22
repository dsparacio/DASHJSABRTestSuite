
{
    "_id": "_design/",
    "_rev": "",
    "language": "javascript",
    "views": {
        "averages": {
            "map": "function(doc) {emit(null, { 'id': doc._id, 'title': doc.average_throughput }); }"
        }
    }
}


{
    "averages": {
        "map": "function(doc) {emit(null, { 'id': doc._id, 'title': doc.average_throughput }); }"
    }
}



function(doc) {if(doc.username == 'Dan') {emit(null, { 'id': doc._id, 'average': doc.average_throughput});};