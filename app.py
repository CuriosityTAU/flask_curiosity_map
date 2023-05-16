from flask import Flask

app = Flask(__name__)

@app.route('/hello/')
def hello():
    return "Hello, World!"

@app.route('/')
def home():
    return "Hello, World!"

if __name__ == '__main__':
    app.run(ssl_context=('../CuriosityMap/vrobotator_tau_ac_il_cert.cer',
                         '../CuriosityMap/vrobotator_tau_ac_il_private.key'),
            debug=True, port=3000)
