import logging
import os
from flask import Flask, render_template

app = Flask(__name__)

# Get the directory path of the current file
current_dir = os.path.dirname(os.path.abspath(__file__))

# Configure the logger
log_file_path = os.path.join(current_dir, 'logs', 'flask_error.log')
logging.basicConfig(filename=log_file_path, level=logging.ERROR)

# Enable logging for Flask
app.logger.addHandler(logging.StreamHandler())
app.logger.setLevel(logging.ERROR)


@app.route('/')
def home():
    return render_template('index.html')


# Handle uncaught exceptions
@app.errorhandler(Exception)
def handle_exception(e):
    app.logger.error('Unhandled Exception: %s', e)
    return 'Internal Server Error', 500


if __name__ == '__main__':
    # the default port is 5000. to use the port specified here run the command 'flask run --port 3000' OR 'python app.py'
    app.run(host='0.0.0.0', port=3000, debug=False)

