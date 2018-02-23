pipeline {
    agent { docker 'node:6.3' }
    stages {
        stage('build') {
            steps {
                sh 'npm --version'
                sh 'docker build -t es6/cueto-goodreads-api .'
            }
        }
    }
}