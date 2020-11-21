const express = require("express");
const app = express();
const datetime = require('datetime');
const AWS = require("aws-sdk");
const validate = require("ip-validator");

AWS.config.loadFromPath("./.aws/credentials.json");

var cloudwatch = new AWS.CloudWatch();
var ec2 = new AWS.EC2({ apiVersion: '2016-11-15' });

let returnErr;
let proceed = true;

const daysOptions = {
    'last_day': 24 * 60 * 60 * 1000,
    'last_week': 24 * 60 * 60 * 7 * 1000,
    'last_month': 24 * 60 * 60 * 30 * 1000
}

const sortArray = (a,b) => {  
    var dateA = new Date(a.date).getTime();
    var dateB = new Date(b.date).getTime();
    return dateA > dateB ? 1 : -1;  
}; 

const validateVariables = (ipAddress, date, period) => {
    if (!validate.ipv4(ipAddress))
        return false;
    if (period % 60 != 0)
        return false;
    if (daysOptions[date] == null)
        return false;

    return true;
}

const getDescribeInstances = (ecParams) => {

    return new Promise((resolve, reject) => {
        ec2.describeInstances(ecParams, function (err, data) {
            if (err) {
                reject(err);
                returnErr = "Server not found";
            }
            else {
                resolve(data);
            }
        });
    });
};

const getMetricStatistics = (cwParams) => {
    return new Promise((resolve, reject) => {
        cloudwatch.getMetricStatistics(cwParams, function (err, data) {
            if (err) {
                console.log(err, err.stack);
                returnErr = err.message;
            }
            else {
                resolve(data);
            }
        });
    })
};

const getCpuUtilization = async (ipAddress, date, period) => {

    if (!validateVariables(ipAddress, date, period)) {
        returnErr = "Variables not valid";
        proceed = false;
        return;
    }

    let ecParams = {
        Filters: [
            {
                Name: "private-ip-address", // For public IP - ip-address
                Values: [
                    ipAddress
                ]
            }
        ]
    };

    let data = await getDescribeInstances(ecParams);

    if (data.Reservations[0] == undefined) {
        proceed = false;
        returnErr = "Server not found";
    }

    if (proceed) {
        let cwParams = {
            Namespace: 'AWS/EC2',
            Period: period,
            StartTime: new Date(Date.now() - daysOptions[date]).toISOString(),
            EndTime: new Date(Date.now()).toISOString(),
            MetricName: 'CPUUtilization',
            Statistics: ['Average'],
            Dimensions: [{ 'Name': 'InstanceId', 'Value': data.Reservations[0].Instances[0].InstanceId }]
        };

        return getMetricStatistics(cwParams).catch(e => {
            if (e) {
                proceed = false;
                returnErr = "There was a problem getting the information";
            }
        });
    }
}

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.get("/", function (req, res) {

    res.send('Server is up!');
})

app.get("/getCpuUtilization", async function (req, res) {

    proceed = true;
    returnErr = "There was a problem getting the information";

    try {

        var utilization = await getCpuUtilization(req.query.ipAddress, req.query.date, req.query.period);

        if (proceed) {
            utilization.Datapoints.sort(sortArray);
            res.send(utilization);
        }
        else
            res.send({ "error": returnErr });
    }
    catch (e) {
        res.send({ "error": returnErr });
    }


});

app.listen(3000, function () {
    console.log("Server is up on port 3000");
})