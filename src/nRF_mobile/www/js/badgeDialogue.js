function Chunk() {
    //Represents a chunk
    var maxSamples = 114;

    this.ts = -1;
    this.ts_ms = 0;
    this.voltage = -1;
    this.sampleDelay = -1;
    this.numSamples = -1;
    this.samples = [];

    /**
    *Sets the header of the chunk
    *@param the timestamp of the chunk
    *@param the fraction (ms) of timestamp
    *@param voltage the voltage at the time the chunk was recorded
    *@param the sampleDelay of the chunk
    *@param the number of samples in this chunk
    */
        this.setHeader= function(ts, ts_ms, voltage, sampleDelay, numSamples) {
        this.ts = ts;
        this.ts_ms = ts_ms;
        this.voltage = voltage;
        this.sampleDelay = sampleDelay;
        this.numSamples = numSamples;
    }.bind(this);

    /*
    *@return the voltage of the chunk
    */
    this.getVoltage = function() {
        return this.voltage;                                                                                
    }.bind(this);

    /*
    *@return the timestamp of the chunk
    */
    this.getTimeStamp = function () {
        return this.ts;
    }.bind(this);

    /*
    *@return the sampleDelay of the chunk
    */
    this.getSampleDelay = function () {
        return this.sampleDelay;
    }.bind(this);

    /*
    *@return the samples of this chunk
    */
    this.getSamples = function(){
        return this.samples;
    }.bind(this);

    /*
    *@param newData the byte array that represents more samples
    */
    this.addSamples = function(newData) {
        this.samples = this.samples.concat(newData);
        if (this.samples.length > this.numSamples) {
            // error
            console.error("Too many samples in chunk!",sampleLength);
        }

    }.bind(this);

    /*
    *resets a chunk to defaults settngs
    */
    this.reset = function () {
        this.ts = -1;
        this.ts_ms = 0;
        this.voltage = -1;
        this.sampleDelay = -1;
        this.numSamples = -1;
        this.samples = [];
    }.bind(this);


    /*
    *@return whether or not the chunk is full
    */
    this.completed = function() {
        return (this.samples.length >= this.numSamples);
    }.bind(this);

    this.toDict = function () {
        return {
            voltage:this.voltage,
            timestamp:this.ts,
            timestamp_ms:this.ts_ms,
            sampleDelay:this.sampleDelay,
            numSamples:this.numSamples,
            samples:this.samples
        };
    }.bind(this);
}



/**
*Represents a badge dialogue for extracting structs
*@param badge badge object
*/
function BadgeDialogue(badge) {
    
    this.StatusEnum = {
        STATUS: 1,
        HEADER: 2,
        DATA: 3,
    };

    var struct = require('./struct.js').struct;
    this.badge = badge;
    this.status = this.StatusEnum.STATUS; //at first we expect a status update
    this.dataPackets = 0;

    this.workingChunk; //chunk we are currently building
    this.chunks = []; //will store chunks once Received

    this.log = function(str) {
        this.badge.log(str);
    }.bind(this);

    /*
    Call this function between sessions to reset the state machine
     */
    this.resetState = function () {
        this.status = this.StatusEnum.STATUS
    }.bind(this);

    /**
    * This function must be called whenever data was sent from the badge
    * data must be a string
    *
    * Holds states, usually expects to recieve a status
    * If unsent data status is Received, will automatically download chunks
    * Chunks stored as chunk objects in chunk array, can be accessed later by getChunks()
    */
    this.onData = function (data) {
        if (this.status == this.StatusEnum.STATUS) {
            var status = struct.Unpack('<BBBLHf',data); //clockSet,dataReady,recording,timestamp_sec,timestamp_ms,voltage
            this.log("Received a status update. Voltage: "+status[3]+' '+status[4]+' '+status[5]);

            //Ask for data
            this.status = this.StatusEnum.HEADER; // expecting a header next
            this.badge.sendString('d'); //request data

        } else if (this.status == this.StatusEnum.HEADER) {
            this.log("Received a header: ");
            var header = struct.Unpack('<LHfHB',data); //time, fraction time (ms), voltage, sample delay, number of samples

            if (header[2] > 1 && header[2] < 4) {
                //valid header?, voltage between 1 and 4
                this.log("&nbsp Timestamp (no ms)" + header[0]);
                this.log("&nbsp Voltage " + header[2]);

                this.status = this.StatusEnum.DATA; // expecting a data buffer next
                this.dataPackets = 0;

                this.workingChunk = new Chunk();
                this.workingChunk.setHeader(header[0], header[1], header[2], header[3], header[4]);
            } else if (header[1] == 0) {
                this.log("End of data received, disconnecting");
                badge.close();
            } else {
                this.log("invalid header");                
            }
        } else if (this.status == this.StatusEnum.DATA) {
            this.dataPackets++;
            //parse as a datapacket
            var sample_arr = struct.Unpack("<" + data.length + "B", data);
            this.workingChunk.addSamples(sample_arr);

            if (this.workingChunk.completed()) {
                //we finished a chunk
                this.status = this.StatusEnum.HEADER; // expecting a header next
                this.chunks.push(this.workingChunk);
                if (this.onNewChunk) {
                    this.onNewChunk(this.workingChunk);
                }
                this.log("Added another chunk, storing " + this.chunks.length + " chunks");

            }
        } else {
            //we messed up somewhere
            this.log("Invalid status enum");
            this.status = this.StatusEnum.STATUS;
        }
    }.bind(this);

    /**
    *updates the given badge with correct time and asks for status
    */
    this.sendStatusRequest = function() {
        //Set current time
        var d = new Date();
        var seconds = Math.round(d.getTime()/1000);
        var ms = d.getTime() % 1000;
        this.log('Sending status request with epoch_seconds: ' + seconds+ ', ms: '+ms);

        var timeString = struct.Pack('<cLH',['s',seconds,ms]);
        this.badge.sendString(timeString);
    }.bind(this);

    /**
    *@returns the array of chunk objects that this badge has extracted
    */
    this.getChunks = function () {
        return this.chunks;
    }.bind(this);
    
}

exports.BadgeDialogue = module.exports = {
	BadgeDialogue: BadgeDialogue
};
