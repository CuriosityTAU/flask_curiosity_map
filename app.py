import logging
import os
from flask import Flask, render_template, jsonify, session, redirect, url_for
from flask import request
from urllib.parse import quote_plus
from datetime import datetime
from descope import (
    REFRESH_SESSION_TOKEN_NAME,
    SESSION_TOKEN_NAME,
    AuthException,
    DeliveryMethod,
    DescopeClient
)
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

# Use the credentials from the service account key
cred = credentials.Certificate('curiositymap-a29c0-firebase-adminsdk-fkcvd-f6619761a8.json')
firebase_admin.initialize_app(cred)
db = firestore.client()


app = Flask(__name__)
app.secret_key = 'secret_key'
print("Flask Secret Key:", app.config['SECRET_KEY'])


# log handler for flask
current_dir = os.path.dirname(os.path.abspath(__file__))
log_file_path = os.path.join(current_dir, 'logs', 'flask_error.log')
logging.basicConfig(filename=log_file_path, level=logging.ERROR)
app.logger.addHandler(logging.StreamHandler())
app.logger.setLevel(logging.ERROR)

# initialize Descope client and validates the user session
descope_client = None
def validate_session():
    global descope_client
    if not descope_client:
        try:
            descope_client = DescopeClient(project_id='P2VLH7n8gye4gfkpWy77EaLbDT8E')

        except Exception as error:
            print("Failed to initialize. Error:")
            print(error)

    # Fetch session token from HTTP Authorization Header
    session_token = request.headers.get('Authorization', None)

    if session_token:
        try:
            jwt_response = descope_client.validate_session(session_token=session_token)
            print("Successfully validated user session:")
            return jwt_response

        except Exception as error:
            print("Could not validate user session. Error:")
            print(error)

# route director
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/check_user', methods=['POST'])
def check_user():
    login_id = request.json.get('loginID')
    print('in check user function')
    print('Login ID is: ', login_id)

    user_ref = db.collection('users').document(login_id)
    user_doc = user_ref.get()

    if user_doc.exists:
        print('User exists in firebase!')
        user_data = user_doc.to_dict()
        user_type = user_data.get('user_type', 'unknown')  # Default to 'unknown' if user_type is not set

        # check if the user signed up (is in parent/teacher DB)
        details_ref = db.collection(user_type+'s').document(login_id)
        details_doc = details_ref.get()

        if details_doc.exists:
            print('User Signed up')
            return jsonify({"exists": True, "user_type": user_type, 'signed_up': True})
        else:
            print('User did not sign up')
            return jsonify({"exists": True, "user_type": user_type, 'signed_up': False})
    else:
        print('User does not exist in firebase')
        return jsonify({"exists": False, "user_type": "unknown"})

@app.route('/set_login_id', methods=['POST'])
def set_login_id():
    print('in set_login_id function')
    data = request.json
    print('saving login Id: ', data['loginID'])
    session['loginID'] = data['loginID']
    print('To check if the login ID was saved properly to flask session we will try to retrieve here: ', session.get('loginID'))
    print('trying to get jwt')
    descope_jwt= validate_session()
    print('descope_jwt', descope_jwt)
    return jsonify({"status": "success"}), 200

@app.route('/consent_forms')
def consent_forms():
    return render_template('consent_forms.html')

@app.route('/signup_form')
def signup_form():
    return render_template('signup_form.html')

@app.route('/get_cities')
def get_cities():
    schools_ref = db.collection('schools')
    cities = {doc.to_dict()['school_city'] for doc in schools_ref.stream()}
    return jsonify(list(cities))

@app.route('/get_schools/<city>')
def get_schools(city):
    schools_ref = db.collection('schools').where('school_city', '==', city)
    schools = [doc.to_dict()['school_name'] for doc in schools_ref.stream()]
    return jsonify(schools)

@app.route('/submit_form', methods=['POST'])
def submit_form():
    # save multiple children if necessary
    def get_child_data(child_number, data):
        return {
            'name': data.get('child_name' + child_number),
            'birth_date': data.get('child_birth_date' + child_number),
            'gender': data.get('child_gender' + child_number),
            'school_city': data.get('city' + child_number),
            'grade': data.get('grade' + child_number),
            'school_name': data.get('school_name' + child_number),
            'teacher_name': data.get('teacher' + child_number),
            'parent_loginId': data.get('parent_loginID'),
            'date_created': current_timestamp
        }

    user_data = request.form.to_dict()
    user_type = user_data.get('user_type')
    current_timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

    if user_type == 'parent':

        parent_loginID = user_data.get('parent_loginID')

        parent_data = {
            'name': user_data.get('parent_name'),
            'birth_date': user_data.get('parent_birth_date'),
            'email': user_data.get('parent_email'),
            'gender': user_data.get('parent_gender'),
            'children': [],
            'date_created': current_timestamp
        }

        child_data = get_child_data('', user_data)
        child_ref, child_entry = db.collection('children').add(child_data)
        parent_data['children'].append(child_entry.id)

        if 'child_gender_2' in user_data.keys():
            child_data_2 = get_child_data('_2', user_data)
            child_ref_2, child_entry_2 = db.collection('children').add(child_data_2)
            parent_data['children'].append(child_entry_2.id)

        db.collection('parents').document(parent_loginID).set(parent_data)
        db.collection('users').document(parent_loginID).set({'user_type': 'parent'})
        return redirect('/parents_homepage')

    elif user_type == 'teacher':
        teacher_data = {
            'name': user_data.get('teacher_name'),
            'birth_date': user_data.get('teacher_birth_date'),
            'email': user_data.get('teacher_email'),
            'gender': user_data.get('teacher_gender'),
            'school_city': user_data.get('city'),
            'school_name': user_data.get('school_name'),
            'grade': user_data.get('grade'),
            'teacher_type': user_data.get('teacher_type'),
            'students': [],
            'authorized': False,
            'date_created': current_timestamp
        }
        teacher_loginID = user_data.get('teacher_loginID')
        db.collection('teachers').document(teacher_loginID).set(teacher_data)
        db.collection('users').document(teacher_loginID).set({'user_type': 'teacher'})
        return redirect('/teachers_homepage')

@app.route('/self_questionnaire')
def self_questionnaire():
    return render_template('self_questionnaire.html')

@app.route('/intermediary')
def intermediary():
    response_id = request.args.get('responseId')
    q_type = request.args.get('q_type', '').strip().replace("'", "").replace('"', '')
    child_id = request.args.get('child_id') if q_type == 'child' else None
    print('in intermediary function')
    print('parameters sent with qualtrics redirect url: 1) response_id: ', response_id,' 2) q_type: ', q_type, ' 3) child_id: ', child_id)
    return render_template('intermediary.html', response_id=response_id, q_type=q_type, child_id=child_id)

@app.route('/self_q_complete')
def self_q_complete():
    print('in self_q_complete function')
    response_id = request.args.get('responseId')
    login_id = request.args.get('loginID')
    print('questionaire reponseID:', response_id)
    print('login_id is:', login_id)
    print('loginID from flask session', session.get('loginID'))
    # Fetch user type from 'users' table
    user_ref = db.collection('users').document(login_id)
    user = user_ref.get()
    if user.exists:
        user_type = user.to_dict().get('user_type')

        # Save the response ID based on user type
        if user_type == 'parent':
            parent= db.collection('parents').document(login_id)
            parent.update({'responseId': response_id})
            return redirect('/parents_homepage')
        elif user_type == 'teacher':
            db.collection('teachers').document(login_id).update({'responseId': response_id})
            print('should redirect here to the teacher homepage ')
            return redirect('/teachers_homepage')

@app.route('/child_q_complete')
def child_q_complete():
    print('in child_q_complete function')
    response_id = request.args.get('responseId')
    login_id = request.args.get('loginID')
    child_id = request.args.get('childID')
    print('questionaire reponseID:', response_id)
    print('login_id is:', login_id)
    print('child_id is:', child_id)
    print('loginID from flask session', session.get('loginID'))
    # Fetch user type from 'users' table
    user_ref = db.collection('users').document(login_id)
    user = user_ref.get()
    if user.exists:
        user_type = user.to_dict().get('user_type')
        child= db.collection('children').document(child_id)
        # Save the response ID based on user type
        if user_type == 'parent':
            child.update({'p_responseId': response_id})
            return redirect('/parents_homepage')
        elif user_type == 'teacher':
            child.update({'t_responseId': response_id})
            return redirect('/teachers_homepage')

@app.route('/checking_for_kids')
def checking_for_kids():
    loginID= session.get('loginID')
    children= db.collection('parents').document(loginID).get().to_dict().get('children')
    print('children', children)
    print('children variable type: ', type(children))
    for child in children:
        kid= db.collection('children').document(child).get().to_dict()
        name= kid.get('name')
        gender= kid.get('gender')
        print('retrieved kid with name: ', name, ' and gender ', gender)

@app.route('/student_questionnaire')
def student_questionnaire():
    return render_template('student_questionnaire.html')

@app.route('/child_questionnaire')
def child_questionnaire():
    child_id = request.args.get('childId')
    child_name = request.args.get('childName')
    if child_id:
        encoded_child_name = quote_plus(child_name)
        encoded_child_id = quote_plus(child_id)
        qualtrics_survey_url = f"https://tauindeng.eu.qualtrics.com/jfe/form/SV_cRY7a7jyosxdT5s?childName={encoded_child_name}&childId={encoded_child_id}"
        # qualtrics_survey_url = "https://tauindeng.eu.qualtrics.com/jfe/form/SV_cRY7a7jyosxdT5s?childName=" + child_name
        # qualtrics_survey_url += "?childId=" + child_id
        return render_template('child_questionnaire.html', qualtrics_survey_url= qualtrics_survey_url)


@app.route('/parents_homepage')
def parents_homepage():
    parent_loginID = session.get('loginID')
    print('in parents_homepage function')
    print('loginID is: ', parent_loginID)
    if not parent_loginID:
        # Redirect to login if the session doesn't have loginID
        return redirect('/')

    parent_ref = db.collection('parents').document(parent_loginID)
    parent_doc = parent_ref.get()
    parent_data = parent_doc.to_dict()

    # Check if self questionnaire has been filled
    self_questionnaire_filled = 'responseId' in parent_data

    # Check if children questionnaire has been filled
    children_status = []
    for child_id in parent_data.get('children', []):
        child_ref = db.collection('children').document(child_id)
        child_doc = child_ref.get()
        child_data = child_doc.to_dict()
        children_status.append({
            'id': child_id,
            'completed': 'p_responseId' in child_data
        })
    all_children_questionnaires_filled = all('p_responseId' in db.collection('children').document(child_id).get().to_dict() for child_id in parent_data.get('children', []))
    print('loading parents page. Is there self_q? ', self_questionnaire_filled, 'are there all children qs?', all_children_questionnaires_filled)
    print('child_qs status: ', children_status)
    return render_template('parents_homepage.html',
                           self_questionnaire_filled=self_questionnaire_filled,
                           all_children_questionnaires_filled= all_children_questionnaires_filled,
                           children_status=children_status)

# function that retrieves the parents children from DB for homepage
@app.route('/get_children_names')
def get_children_names():
    parent_loginID = session.get('loginID')
    if not parent_loginID:
        return jsonify({'error': 'User not logged in'}), 403

    parent_ref = db.collection('parents').document(parent_loginID)
    parent_doc = parent_ref.get()
    parent_data = parent_doc.to_dict()

    children_info = []
    for child_id in parent_data.get('children', []):
        child_ref = db.collection('children').document(child_id)
        child_doc = child_ref.get()
        child_data = child_doc.to_dict()
        if 'responseID' not in child_data:
            children_info.append({
                'id': child_id,
                'name': child_data.get('name', 'Unknown')
            })

    return jsonify(children_info)

@app.route('/teachers_homepage')
def teachers_homepage():
    teacher_loginID = session.get('loginID')
    if not teacher_loginID:
        # Redirect to login if the session doesn't have loginID
        return redirect('/')

    teacher_ref = db.collection('teachers').document(teacher_loginID)
    teacher_data = teacher_ref.get().to_dict()

    # Check if self questionnaire has been filled
    self_questionnaire_filled = 'responseId' in teacher_data

    return render_template('teachers_homepage.html', self_questionnaire_filled=self_questionnaire_filled)

@app.route('/get_teachers_students')
def get_teachers_students():
    teacher_loginID = session.get('loginID')
    teacher_ref = db.collection('teachers').document(teacher_loginID)
    teacher_data = teacher_ref.get().to_dict()
    email= teacher_data.get('email')
    if teacher_data and teacher_data.get('authorized'):
        children_info = []
        for student_key in teacher_data.get('students', []):
            child_ref = db.collection('children').document(student_key)
            child_data = child_ref.get().to_dict()
            if child_data:
                children_info.append({
                    'id': student_key,
                    'name': child_data.get('name', 'Unknown'),
                    't_responseId': child_data.get('t_responseId', None)
                })
        return jsonify({'authorized': True, 'students': children_info, 'email': email})
    else:
        return jsonify({'authorized': False, 'email': email})

@app.route('/update_teacher_email', methods=['POST'])
def update_teacher_email():
    teacher_loginID = session.get('loginID')
    new_email = request.form.get('newEmail')
    print('new email submitted', new_email)

    if new_email:
        teacher_ref = db.collection('teachers').document(teacher_loginID)
        teacher_ref.update({'email': new_email})
        return jsonify({'success': True})
    return jsonify({'success': False})

# Handle uncaught exceptions
@app.errorhandler(Exception)
def handle_exception(e):
    app.logger.error('Unhandled Exception: %s', e)
    return 'Internal Server Error', 500


if __name__ == '__main__':
    # the default port is 5000. to use the port specified here run the command 'flask run --port 3000' OR 'python app.py'
    app.run(host='0.0.0.0', port=3000, debug=True)

