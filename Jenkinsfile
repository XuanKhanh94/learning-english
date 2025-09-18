pipeline {
    agent any
    environment {
        CONTAINER_NAME="learning-container"
        IMAGE_NAME = "learning-image"
        TAG = "latest"
        BUILD_DIR="/var/jenkins_home/workspace/Deploy-learning.katin.cloud"
    }
    options {
        skipDefaultCheckout(true)
    }
    stages {
        stage('Checkout') {
            steps {
                dir("${BUILD_DIR}"){
                    deleteDir ()
                    checkout scm
                }
            }
        }
    stage('Remove Old Image') {
                steps {
                    sh """
                        docker rmi -f ${IMAGE_NAME}|| true
                    """
                }
         }

        stage('Build Docker Image') {
            steps {
                sh "docker build -t  ${IMAGE_NAME} ."
            }
        }

        stage('Remove Old Container') {
            steps {
                sh """
                    docker rm -f ${CONTAINER_NAME} || true
                """
            }
        }
        
        stage('Run New Container') {
            steps {
                sh """
                    docker run -d --restart=unless-stopped --name ${CONTAINER_NAME} --network katin-net -p 5173:5173  ${IMAGE_NAME}
                """
            }
        }
    }
}
