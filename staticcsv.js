module.exports = class StaticCSV {
    /** 
     * @param {List[List[String]]} cvsList List of tokenized lines parsed from a CSV file.
     */
    constructor(cvsList) {
        this._contents = []
        this._header = []

        // If file empty, then do nothing.
        if(cvsList.empty) return;

        // Otherwise read through each row
        let contents = [];
        let header = cvsList[0];
        const numCols = header.length;
        for(let i = 1; i < cvsList.length; i++){
            let row = cvsList[i];
            if(row.length != numCols) continue;

            let row_obj = {};
            for(let j = 0; j < row.length; j++){
                row_obj[header[j]] = row[j];
            }
            contents.push(row_obj);
        }
        
        this._contents = contents;
        this._header = header;
    }

    get header(){
        return this._header;
    }

    get rows(){
        return this._contents;
    }
};
