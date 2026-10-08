package response

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-playground/validator/v10"
)

type Response struct {
    Status  string      `json:"status"`
    Message string      `json:"message"`
    Data    interface{} `json:"data,omitempty"`
    Error   string      `json:"error,omitempty"`
}

const (
    StatusOK    = "OK"
    StatusError = "ERROR"
)

func WriteJson(w http.ResponseWriter, status int, payload interface{}) error {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    return json.NewEncoder(w).Encode(payload)
}

func GeneralError(message string, err error) Response {
    errMsg := ""
    if err != nil {
        errMsg = err.Error()
    }
    
    return Response{
        Status:  StatusError,
        Message: message,
        Data:    nil,
        Error:   errMsg,
    }
}

func GeneralSuccess(message string, data interface{}) Response {
    return Response{
        Status:  StatusOK,
        Message: message,
        Data:    data,
        Error:   "",
    }
}

func ValidationError(errs validator.ValidationErrors) Response {
	var errMsgs []string
	for _, err := range errs {
		switch err.ActualTag(){
			case "required":
				errMsgs = append(errMsgs, fmt.Sprintf("field %s is required field", err.Field()))
			case "gt":
				errMsgs = append(errMsgs, fmt.Sprintf("field %s must be greater than %s", err.Field(), err.Param()))
			case "lt":
				errMsgs = append(errMsgs, fmt.Sprintf("field %s must be less than %s", err.Field(), err.Param()))
			default:
				errMsgs = append(errMsgs, fmt.Sprintf("field %s failed validation with tag %s", err.Field(), err.ActualTag()))
		}
	}
	return Response{
		Status:  StatusError,
		Message: "Validation failed",
		Data:    nil,
		Error:   strings.Join(errMsgs, ", "),
	}
}