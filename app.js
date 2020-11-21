const express = require("express");
const app = express();
const datetime = require('datetime');
const AWS = require("aws-sdk");
const validate = require("ip-validator");

AWS.config.loadFromPath("./.aws/credentials.json");

var cloudwatch = new AWS.CloudWatch();
var ec2 = new AWS.EC2({ apiVersion: '2016-11-15' });

const daysOptions = {
    'last_day': 24 * 60 * 60 * 1000,
    'last_week': 24 * 60 * 60 * 7 * 1000,
    'last_month': 24 * 60 * 60 * 30 * 1000
}

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
                throw new Error("Server not found");
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
            if (err)
                console.log(err, err.stack);
            else {
                resolve(data);
            }
        });
    })
};

const getCpuUtilization = async (ipAddress, date, period) => {

    let proceed = true;

    if (!validateVariables(ipAddress, date, period)) {
        throw new Error("Variables not valid");
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
        throw new Error("Server not found");
        return;
    }

    if (proceed) {
        console.log
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
            proceed = false;
            throw new Error("There was a problem getting the information");
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

    try {
        var utilization = await getCpuUtilization(req.query.ipAddress, req.query.date, req.query.period);
        res.send(utilization);
    }
    catch (e) {
        console.log(e);
        res.status(500).json(e);
    }
});



app.listen(3000, function () {
    console.log("Server is up on port 3000");
})