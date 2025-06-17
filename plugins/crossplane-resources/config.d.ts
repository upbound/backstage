export interface Config {
    /**
    * Frontend root URL
    * NOTE: Visibility applies to only this field
    * @visibility frontend
    */
    crossplane?: {
      /**
      * Enable permission frameowrk checks
      * NOTE: Visibility applies to only this field
      * @visibility frontend
      */
      enablePermissions: boolean;
    }
  }